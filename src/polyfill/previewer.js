import EventEmitter from "event-emitter";

import Fitting from "../fitting/fitting";
import Chunker from "../chunker/chunker";
import Polisher from "../polisher/polisher";

import { registerHandlers, initializeHandlers } from "../utils/handlers";

class Previewer {
	constructor() {
		// this.preview = this.getParams("preview") !== "false";

		// Process styles
		this.polisher = new Polisher(false);

		//Fitting Algorithm
		this.fitter = new Fitting();

		// Chunk contents
		this.chunker = new Chunker();

		// Hooks
		this.hooks = {};

		// default size
		this.size = {
			width: {
				value: 8.5,
				unit: "in"
			},
			height: {
				value: 11,
				unit: "in"
			},
			format: undefined,
			orientation: undefined
		};

		this.chunker.on("page", (page) => {
			this.emit("page", page);
		});

		this.chunker.on("rendering", () => {
			this.emit("rendering", this.chunker);
		});
	}

	initializeHandlers() {
		let handlers = initializeHandlers(this.chunker, this.polisher, this);

		handlers.on("size", (size) => {
			this.size = size;
			this.emit("size", size);
		});

		handlers.on("atpages", (pages) => {
			this.atpages = pages;
			this.emit("atpages", pages);
		});

		return handlers;
	}

	registerHandlers() {
		return registerHandlers.apply(registerHandlers, arguments);
	}

	getParams(name) {
		let param;
		let url = new URL(window.location);
		let params = new URLSearchParams(url.search);
		for(var pair of params.entries()) {
			if(pair[0] === name) {
				param = pair[1];
			}
		}

		return param;
	}

	wrapContent() {
		// Wrap body in template tag
		let body = document.querySelector("body");

		// Check if a template exists
		let template;
		template = body.querySelector(":scope > template[data-ref='pagedjs-content']");

		if (!template) {
			// Otherwise create one
			template = document.createElement("template");
			template.dataset.ref = "pagedjs-content";
			template.innerHTML = body.innerHTML;
			body.innerHTML = "";
			body.appendChild(template);
		}

		return template.content;
	}

	removeStyles(doc=document) {
		// Get all stylesheets
		let stylesheets = Array.from(doc.querySelectorAll("link[rel='stylesheet']"));
		let hrefs = stylesheets.map((sheet) => {
			sheet.remove();
			return sheet.href;
		});

		// Get inline styles
		let inlineStyles = Array.from(doc.querySelectorAll("style:not([data-pagedjs-inserted-styles])"));
		inlineStyles.forEach((inlineStyle) => {
			let obj = {};
			obj[window.location.href] = inlineStyle.textContent;
			hrefs.push(obj);
			inlineStyle.remove();
		});

		return hrefs;
	}

	async preview(content, stylesheets, renderTo) {
		//Prende il content e lo inserisce nel tag template
		if (!content) {
			content = this.wrapContent();
		}

		if (!stylesheets) {
			stylesheets = this.removeStyles();
		}

		this.polisher.setup(); // setup del polisher da base.js che è un file contenente del CSS per sostituire le regole di pagedmedia	

		this.handlers = this.initializeHandlers();

		await this.polisher.add(...stylesheets);

		let startTime = performance.now();
		
		
		let flow = await this.fitter.flow(content,renderTo);
		//let flow = await this.chunker.flow(content, renderTo);

		let endTime = performance.now();

		flow.performance = (endTime - startTime);
		flow.size = this.size;

		this.emit("rendered", flow);

		return flow;
	}
}

EventEmitter(Previewer.prototype);

export default Previewer;
