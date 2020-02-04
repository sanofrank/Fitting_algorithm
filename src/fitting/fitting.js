import Page from "./page";
import ContentParser from "./parser";
import EventEmitter from "event-emitter";
import Hook from "../utils/hook";
import Queue from "../utils/queue";
import {
	requestIdleCallback
} from "../utils/utils";
import { parse } from "css-tree";

const MAX_PAGES = false;
// Template di una pagina
const TEMPLATE = `
<div class="pagedjs_page">
	<div class="pagedjs_sheet">
		<div class="pagedjs_bleed pagedjs_bleed-top">
			<div class="pagedjs_marks-crop"></div>
			<div class="pagedjs_marks-middle">
				<div class="pagedjs_marks-cross"></div>
			</div>
			<div class="pagedjs_marks-crop"></div>
		</div>
		<div class="pagedjs_bleed pagedjs_bleed-bottom">
			<div class="pagedjs_marks-crop"></div>
			<div class="pagedjs_marks-middle">
				<div class="pagedjs_marks-cross"></div>
			</div>		<div class="pagedjs_marks-crop"></div>
		</div>
		<div class="pagedjs_bleed pagedjs_bleed-left">
			<div class="pagedjs_marks-crop"></div>
			<div class="pagedjs_marks-middle">
				<div class="pagedjs_marks-cross"></div>
			</div>		<div class="pagedjs_marks-crop"></div>
		</div>
		<div class="pagedjs_bleed pagedjs_bleed-right">
			<div class="pagedjs_marks-crop"></div>
			<div class="pagedjs_marks-middle">
				<div class="pagedjs_marks-cross"></div>
			</div>
			<div class="pagedjs_marks-crop"></div>
		</div>
		<div class="pagedjs_pagebox">
			<div class="pagedjs_margin-top-left-corner-holder">
				<div class="pagedjs_margin pagedjs_margin-top-left-corner"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-top">
				<div class="pagedjs_margin pagedjs_margin-top-left"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-top-center"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-top-right"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-top-right-corner-holder">
				<div class="pagedjs_margin pagedjs_margin-top-right-corner"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-right">
				<div class="pagedjs_margin pagedjs_margin-right-top"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-right-middle"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-right-bottom"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-left">
				<div class="pagedjs_margin pagedjs_margin-left-top"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-left-middle"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-left-bottom"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-bottom-left-corner-holder">
				<div class="pagedjs_margin pagedjs_margin-bottom-left-corner"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-bottom">
				<div class="pagedjs_margin pagedjs_margin-bottom-left"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-bottom-center"><div class="pagedjs_margin-content"></div></div>
				<div class="pagedjs_margin pagedjs_margin-bottom-right"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_margin-bottom-right-corner-holder">
				<div class="pagedjs_margin pagedjs_margin-bottom-right-corner"><div class="pagedjs_margin-content"></div></div>
			</div>
			<div class="pagedjs_area">
				<div class="pagedjs_page_content"></div>
			</div>
		</div>
	</div>
</div>`;

/**
 * Fitting algorithm
 * @class
 */
class Fitter {
	constructor(content, renderTo) {
		// this.preview = preview;


		this.hooks = {};
		this.hooks.beforeParsed = new Hook(this);
		this.hooks.afterParsed = new Hook(this);
		this.hooks.beforePageLayout = new Hook(this);
		this.hooks.layout = new Hook(this);
		this.hooks.renderNode = new Hook(this);
		this.hooks.layoutNode = new Hook(this);
		this.hooks.onOverflow = new Hook(this);
		this.hooks.onBreakToken = new Hook();
		this.hooks.afterPageLayout = new Hook(this);
		this.hooks.afterRendered = new Hook(this);

		this.pages = [];
		this._total = 0;

		this.q = new Queue(this);
		this.stopped = false;
		this.rendered = false;

		this.content = content;

		this.charsPerBreak = [];
		this.maxChars;

		this.book = {
			tot_blocks: 0,
			tot_score: 0,
			current_page_height: 0,
			pages: []
		}

		if (content) {
			this.flow(content, renderTo);
		}
	}

	setup(renderTo) {
		this.pagesArea = document.createElement("div"); //crea un elemento div
		this.pagesArea.classList.add("pagedjs_pages"); //lo aggiunge alla classe pagedjs_pages
		if (renderTo) {
			renderTo.appendChild(this.pagesArea); //Se renderTo esiste, allora aggiunge il div al DOM
		} else {
			document.querySelector("body").appendChild(this.pagesArea); //Altrimenti seleziona il body dal documento e lo aggiunge alla pagesArea
		}


		this.pageTemplate = document.createElement("template"); //Crea un tag template
		this.pageTemplate.innerHTML = TEMPLATE; //Copia e incolla TEMPLATE in <template>
	}

	loadFonts() {
		let fontPromises = [];
		document.fonts.forEach((fontFace) => {
			if (fontFace.status !== "loaded") {
				let fontLoaded = fontFace.load().then((r) => {
					return fontFace.family;
				}, (r) => {
					console.warn("Failed to preload font-family:", fontFace.family);
					return fontFace.family;
				});
				fontPromises.push(fontLoaded);
			}
		});
		return Promise.all(fontPromises).catch((err) => {
			console.warn(err);
		});
	}

	async flow(content, renderTo) {
		let parsed;

		parsed = new ContentParser(content); //Fa il parsing del codice aggiungendo le REFS e togliendo gli spazzi vuoti
		//Ancora non è stato chunkato
		this.source = parsed; //Il testo HTML diventa la source
		this.breakToken = undefined;

		if (this.pagesArea && this.pageTemplate) {
			this.q.clear();
			this.removePages();
		} else {
			this.setup(renderTo); //Setup del contenitore e della prima pagina
		}

		await this.loadFonts();

		let fit = await this.fitting(parsed, this.breakToken);

		console.log("fit",fit);
		//console.log(error);

		let rendered = await this.render(parsed, this.breakToken, fit);

		while (rendered.canceled) {
			this.start();
			rendered = await this.render(parsed, this.breakToken, fit);
		}

		this.rendered = true;

		await this.hooks.afterRendered.trigger(this.pages, this);

		this.emit("rendered", this.pages);
		return this;
	}

	async render(parsed, startAt, fit) {
		console.log("render", fit);
		let renderer = this.layout(parsed, startAt, fit);

		let done = false;
		let result;

		while (!done) {
			console.log("rendering asincrono");
			result = await this.q.enqueue(() => { return this.renderAsync(renderer); });
			done = result.done;
		}

		return result;
	}

	async renderAsync(renderer) {
		if (this.stopped) {
			return { done: true, canceled: true };
		}
		let result = await renderer.next();
		if (this.stopped) {
			return { done: true, canceled: true };
		} else {
			return result;
		}
	}



	async *layout(content, startAt, fit) {
		console.log("layout",fit);
		let breakToken = startAt || false;
		// DEVO MODIFICARE QUI!!!!!	
		console.log("LAYOUT BreakToken value = ", breakToken);

		while (breakToken !== undefined && (MAX_PAGES ? this.total < MAX_PAGES : true)) { //QUI CREA LE PAGINE E LE RIEMPIE MANO A MANO
			console.log("Fintanto che trova il breaktoken sta qui dentro");

			if (breakToken && breakToken.node) {
				await this.handleBreaks(breakToken.node); //Controlla se c'è un break presettato e aggiunge una pagina bianca.
			} else {
				//Prende il primo capitolo
				await this.handleBreaks(content.firstChild);

			}

			let page = this.addPage(); //Ci torna ogni volta che una pagina è completa. 
			console.log("Aggiunge una pagina in *layout", page);

			// Layout content in the page, starting from the breakToken
			console.log("MAX CHARS", this.maxChars);
			breakToken = await page.layout(content, breakToken, this.maxChars,fit);
			//await this.hooks.afterPageLayout.trigger(page.element, page, breakToken, this);

			//this.emit("renderedPage", page);
			//Si è fermato qui.
			this.recoredCharLength(page.wrapper.textContent.length);
			yield breakToken; //ritorna breakToken

			// Stop if we get undefined, showing we have reached the end of the content
		}
	}

	async fitting(content, startAt) {

		let page = this.addPage();

		let bestSequence = await page.simpleFitting(content, startAt, this.maxChars);

		this.removePages(0);

		return bestSequence; 
		
	}

	removePages(fromIndex=0) {

		if (fromIndex >= this.pages.length) {
			return;
		}

		// Remove pages
		for (let i = fromIndex; i < this.pages.length; i++) {
			this.pages[i].destroy();
		}

		if (fromIndex > 0) {
			this.pages.splice(fromIndex);
		} else {
			this.pages = [];
		}
	}

	recoredCharLength(length) {
		if (length === 0) {
			return;
		}
		this.charsPerBreak.push(length);

		// Keep the length of the last few breaks
		if (this.charsPerBreak.length > 4) {
			this.charsPerBreak.shift();
		}

		this.maxChars = this.charsPerBreak.reduce((a, b) => a + b, 0) / (this.charsPerBreak.length);
	}

	//METODO MODIFICATO
	addPage(blank) {
		let lastPage = this.pages[this.pages.length - 1];
		// Create a new page from the template
		let page = new Page(this.pagesArea, this.pageTemplate, blank, this.hooks);

		this.pages.push(page);

		// Create the pages
		page.create(undefined, lastPage && lastPage.element);
		page.index(this.total);


		//page.index(this.total);
		if (!blank) {
			// Listen for page overflow
			page.onOverflow((overflowToken) => {
				console.warn("overflow on", page.id, overflowToken);
				// Only reflow while rendering
				if (this.rendered) {
					return;
				}

				let index = this.pages.indexOf(page) + 1;

				// Stop the rendering
				this.stop();

				// Set the breakToken to resume at
				this.breakToken = overflowToken;
				console.log("DENTRO onOverflow", overflowToken);


				// Remove pages
				this.removePages(index);

				if (this.rendered === true) {
					this.rendered = false;

					this.q.enqueue(async () => {

						this.start();

						await this.render(this.source, this.breakToken);

						this.rendered = true;

					});
				}


			});

			page.onUnderflow((overflowToken) => {
				// console.log("underflow on", page.id, overflowToken);

				// page.append(this.source, overflowToken);

			});
		}

		this.total = this.pages.length;

		return page;
	}

	async handleBreaks(node) {
		let currentPage = this.total + 1;
		let currentPosition = currentPage % 2 === 0 ? "left" : "right";
		// TODO: Recto and Verso should reverse for rtl languages
		let currentSide = currentPage % 2 === 0 ? "verso" : "recto";
		let previousBreakAfter;
		let breakBefore;
		let page;

		if (currentPage === 1) {
			console.log("prima pagina", node);
			return;
		}

		if (node &&
			typeof node.dataset !== "undefined" &&
			typeof node.dataset.previousBreakAfter !== "undefined") { //Credo che se già dovesse esistere un previousBreakAfter lo inizializza.
			previousBreakAfter = node.dataset.previousBreakAfter;
		}

		if (node &&
			typeof node.dataset !== "undefined" &&
			typeof node.dataset.breakBefore !== "undefined") { //Uguale con breakBefore
			breakBefore = node.dataset.breakBefore;
		}
		//Qui decide se aggiungere una pagina bianca.
		if (previousBreakAfter &&
			(previousBreakAfter === "left" || previousBreakAfter === "right") &&
			previousBreakAfter !== currentPosition) {
			page = this.addPage(true);
		} else if (previousBreakAfter &&
			(previousBreakAfter === "verso" || previousBreakAfter === "recto") &&
			previousBreakAfter !== currentSide) {
			page = this.addPage(true);
		} else if (breakBefore &&
			(breakBefore === "left" || breakBefore === "right") &&
			breakBefore !== currentPosition) {
			page = this.addPage(true);
		} else if (breakBefore &&
			(breakBefore === "verso" || breakBefore === "recto") &&
			breakBefore !== currentSide) {
			page = this.addPage(true);
		}

		/*if (page) {
			await this.hooks.beforePageLayout.trigger(page, undefined, undefined, this);
			this.emit("page", page);
			// await this.hooks.layout.trigger(page.element, page, undefined, this);
			await this.hooks.afterPageLayout.trigger(page.element, page, undefined, this);
			this.emit("renderedPage", page);
		}*/
	}

}




/*

let style;
let currentSize;
let breakPoint;


function microTweakDe(ps){
        for(let item of ps){
            style = window.getComputedStyle(item, null).getPropertyValue('font-size');
            currentSize = parseFloat(style);
            console.log(currentSize);
            item.style.fontSize = (currentSize - 0.05) + 'px';
        }

    }

function microTweakEn(ps){
    for(let item of ps){
        style = window.getComputedStyle(item, null).getPropertyValue('font-size');
        currentSize = parseFloat(style);
        console.log(currentSize);
        item.style.fontSize = (currentSize + 0.05) + 'px';
    }
}


class Prova extends Paged.Handler {
    constructor(chunker, polisher, caller) {
      super(chunker, polisher, caller);
    }

    afterPageLayout(pageFragment, page,breakToken) {      
        let ps = pageFragment.getElementsByTagName("p");
        for(let item of ps){
            style = window.getComputedStyle(item, null).getPropertyValue('font-size');
            currentSize = parseFloat(style);
            console.log(currentSize);
            item.style.fontSize = (currentSize - 0.05) + 'px';
        }
            console.log(page);
            console.log(pageFragment);
            console.log(breakToken);
        
        
    }
  }

  class ProvaDue extends Paged.Handler {
    constructor(chunker, polisher, caller) {
      super(chunker, polisher, caller);
    }

    beforeParsed(content) {      
        console.log(content);
    }
  
  }

  //Paged.registerHandlers(ProvaDue);

*/

EventEmitter(Fitter.prototype);


export default Fitter;
