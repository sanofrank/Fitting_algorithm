import {
	getBoundingClientRect,
	getClientRects
} from "../utils/utils";
import {
	walk,
	nodeAfter,
	nodeBefore,
	rebuildAncestors,
	needsBreakBefore,
	needsPreviousBreakAfter,
	needsPageBreak,
	isElement,
	isText,
	indexOf,
	indexOfTextNode,
	cloneNode,
	findElement,
	child,
	isContainer,
	hasContent,
	validNode,
	prevValidNode,
	words,
	letters,
} from "../utils/dom";
import EventEmitter from "event-emitter";
import Hook from "../utils/hook";

const MAX_CHARS_PER_BREAK = 1500;

/**
 * Layout
 * @class
 */
class Layout {

	constructor(element, hooks, maxChars) {
		this.element = element;

		this.bounds = this.element.getBoundingClientRect();

		if (hooks) {
			this.hooks = hooks;
		} else {
			this.hooks = {};
			this.hooks.layout = new Hook();
			this.hooks.renderNode = new Hook();
			this.hooks.layoutNode = new Hook();
			this.hooks.beforeOverflow = new Hook();
			this.hooks.onOverflow = new Hook();
			this.hooks.onBreakToken = new Hook();
		}

		this.maxChars = maxChars || MAX_CHARS_PER_BREAK; //1500 DEFAULT

		this.data_break_after;
		this.data_break_before;

		this.fit; //Best Sequence

	}

	async renderBlocks(wrapper, source, breakToken, bounds = this.bounds) {
		//Al primo giro, la source è il capitolo e il breakToken è false
		let start = this.getStart(source, breakToken);
		console.log("Start BreakToken", start);
		//Start è il capitolo all'inizio
		let walker = walk(start, source); //start: l'oggetto d'attraversare, source The "className" for the root object

		let node;
		let done;
		let next;

		let blocks = [];

		let iterator = 0;

		let hasRenderedContent = false;

		let flyspeckArray = [];

		//let newBreakToken;

		//let length = 0;

		while (!done) { //finchè non trova un nuovo breaktoken continua a girare

			let block = {
				tagName: "",
				ref: "",
				type: "",
				break_after: "",
				break_before: "",
				width: 0,
				height: 0,
				left: 0,
				right: 0,
				lines: []
			};
	
			let blockVer = [];

			let divContainer = false;

			next = walker.next(); //Scorre gli elementi di source
			node = next.value; //Prende il valore HTML
			console.log("next.value", node);
			done = next.done; //true una volta terminato (callback)

			if (!node) {
				//this.hooks && this.hooks.layout.trigger(wrapper, this);
				let imgs = wrapper.querySelectorAll("img");
				if (imgs.length) { //Se è un' immagine, cerca la grandezza
					await this.waitForImages(imgs);
				}

				//newBreakToken = this.findBreakToken(wrapper, source, bounds);

				return blocks;
			}

			//this.hooks && this.hooks.layoutNode.trigger(node);

			// Check if the rendered element has a break set
			//Ad esempio i tag section
			/*if (hasRenderedContent && this.shouldBreak(node)) {

				this.hooks && this.hooks.layout.trigger(wrapper, this);

				let imgs = wrapper.querySelectorAll("img");
				if (imgs.length) {
					await this.waitForImages(imgs);
				}
				newBreakToken = this.findBreakToken(wrapper, source, bounds);

				if (!newBreakToken) {
					newBreakToken = this.breakAt(node);
				}

				//length = 0;

				break;
			}*/

			// Should the Node be a shallow or deep clone
			let shallow = isContainer(node); //Valore boolean che si attiva nel caso sia un tipo DIV
			console.log(node, wrapper, "Breaktoken", breakToken, shallow);
			//console.log("breakToken", breakToken); //Il breakToken è il paragrafo intero che va tagliato.

			if(shallow && node.tagName == "DIV"){

				divContainer = true;
				shallow = false;
			}

			let rendered = this.appendModified(node, wrapper, shallow);
			console.log("rendered", rendered);

			if(this.shouldBreak(node)){
				if(node.tagName === "SECTION"){

					this.data_break_after = node.getAttribute("data-break-after");
					this.data_break_before = node.getAttribute("data-break-before");
				
				}
			}


			
			//Se è testo prendo le informazioni e rimuovo il blocco dalla pagina.
			if (!shallow && divContainer == false) {
			
				//Crea un blocco nuovo ogni iterazione

				let chapterTitle = false;
				let renderedBounding = getBoundingClientRect(rendered);
				let lines = this.getLines(rendered,wrapper,renderedBounding);
				
				let flyspeckLimit = (renderedBounding.width/100)*15; //get the 10% of the boundingClientRect of the block

				let parent = rendered.parentNode.tagName;

				if (parent == "HEADER") {
					renderedBounding = rendered.parentElement.getBoundingClientRect();
					chapterTitle = true;
				}

				block = this.createBlock(block,rendered,renderedBounding,lines,"normal");

				blocks.push(blockVer);

				if(lines.length > 1 && chapterTitle == false){

					let flyspeck = (lines[lines.length - 1].width <= flyspeckLimit) ? true : false;

					switch(flyspeck){
						case true :
							flyspeckArray.push(block);
							break;
						case false :
							blocks[iterator].push(block);
							break;
					}					

				}else{
					blocks[iterator].push(block);
				}

				console.log("blocks", blocks);

				if (chapterTitle) {

					blocks[iterator][0].break_after = this.data_break_after;
					blocks[iterator][0].break_before = this.data_break_before;

					rendered.parentNode.remove();
					rendered.remove();

				} else {

					//Expand	
					let elementStyle = window.getComputedStyle(rendered, null).getPropertyValue('word-spacing');
					let currentSize = parseFloat(elementStyle);
					rendered.style.wordSpacing = (currentSize + 0.05) + 'em';

					renderedBounding = rendered.getBoundingClientRect();
					lines = this.getLines(rendered,wrapper,renderedBounding);

					let exBlock = JSON.parse(JSON.stringify(block));

					exBlock.lines = [];

					exBlock = this.createBlock(exBlock,rendered,renderedBounding,lines,"expand");

					if(lines.length > 1 && chapterTitle == false){

						let flyspeck = (lines[lines.length - 1].width <= flyspeckLimit) ? true : false;

						switch(flyspeck){
							case true :
								flyspeckArray.push(exBlock);
								break;
							case false :
								blocks[iterator].push(exBlock);
								break;
						}					
	
					}else{
						blocks[iterator].push(exBlock);
					}
	
					//Reduce

					rendered.style.wordSpacing = (currentSize - 0.05) + 'em';

					renderedBounding = rendered.getBoundingClientRect();
					lines = this.getLines(rendered,wrapper,renderedBounding);

					let redBlock = JSON.parse(JSON.stringify(block));

					redBlock.lines = [];

					redBlock = this.createBlock(redBlock,rendered,renderedBounding,lines,"reduced");

					if(lines.length > 1 && chapterTitle == false){

						let flyspeck = (lines[lines.length - 1].width <= flyspeckLimit) ? true : false;
	
						switch(flyspeck){
							case true :
								flyspeckArray.push(redBlock);
								break;
							case false :
								blocks[iterator].push(redBlock);
								break;
						}					
	
					}else{
						blocks[iterator].push(redBlock);
					}

					console.log("flyspeckArray",flyspeckArray);

					if(flyspeckArray.length == 3){
						
						//let int = this.getRandomInt(3);

						//let winnerBlock = flyspeckArray[int];

						blocks[iterator].push(flyspeckArray[1]);
						
					}

					rendered.remove();
				}

				flyspeckArray = []; //azzero l'array

				iterator = iterator + 1;

			}

			if(divContainer == true){

				let renderedBounding = getBoundingClientRect(rendered);
				console.log("divContainer",renderedBounding);
				let lines = [];

				block = this.createBlock(block,rendered,renderedBounding,lines,"normal");

				block.break_after = "avoid";
				block.break_before = "avoid";

				blocks.push(blockVer);
				blocks[iterator].push(block);

				iterator ++;

				rendered.remove();
			}

			//length += rendered.textContent.length; //Textlength in page, Prende solo la lunghezza del testo, se ha un container, giustamente non prende niente
			// Check if layout has content yet
			if (!hasRenderedContent) {
				hasRenderedContent = hasContent(node);
			}

			// Skip to the next node if a deep clone was rendered
			if (!shallow) {
				//Entra se c'è del testo in sostanza
				walker = walk(nodeAfter(node, source), source); //A questo punto la camminata passa al nodo successivo, nextSibiling
				console.log("Walk After", walker);
			}

			// Only check x characters
			//Noi all'inizio non sappiamo quanto sia la lunghezza effettiva della pagina, ma superato il default di 1500 di lunghezza, cerca un breaktoken
			/*if (length >= this.maxChars) {

				this.hooks && this.hooks.layout.trigger(wrapper, this);

				let imgs = wrapper.querySelectorAll("img");
				if (imgs.length) {
					await this.waitForImages(imgs);
				}

				newBreakToken = this.findBreakToken(wrapper, source, bounds);

				if (newBreakToken) {
					length = 0;
				}
			}*/

		}
		
		return blocks;
		//return newBreakToken;
	}

	getBoundingRect(element) {

		var style = window.getComputedStyle(element); 
		var margin = {
			left: parseInt(style["margin-left"]),
			right: parseInt(style["margin-right"]),
			top: parseInt(style["margin-top"]),
			bottom: parseInt(style["margin-bottom"])
		};
		var padding = {
			left: parseInt(style["padding-left"]),
			right: parseInt(style["padding-right"]),
			top: parseInt(style["padding-top"]),
			bottom: parseInt(style["padding-bottom"])
		};
		var border = {
			left: parseInt(style["border-left"]),
			right: parseInt(style["border-right"]),
			top: parseInt(style["border-top"]),
			bottom: parseInt(style["border-bottom"])
		};
		
		
		var rect = element.getBoundingClientRect();
		rect = {
			left: rect.left - margin.left,
			right: rect.right - margin.right - padding.left - padding.right,
			top: rect.top - margin.top,
			bottom: rect.bottom - margin.bottom - padding.top - padding.bottom - border.bottom  
		};
		rect.width = rect.right - rect.left;
		rect.height = rect.bottom - rect.top;
		
		return {rect,margin};
		
	};


	createBlock(block,rendered,renderedBounding,lines,type){

		block.tagName = rendered.tagName;
		block.ref = rendered.getAttribute("data-ref");
		block.type = type;
		block.width = renderedBounding.width;
		if(rendered.tagName !== "DIV"){

			block.height = renderedBounding.height;

		}else{

			let rect = this.getBoundingRect(rendered);

			block.height = renderedBounding.height + rect.margin.top + rect.margin.bottom;
		}
		block.left = renderedBounding.left;
		block.right = renderedBounding.right;

		let line;

		for (var i = 0; i != lines.length; i++) { //ogni riga.
			line = lines[i];
			console.log(line.width, line.height);
			block.lines.push(line);
		} //Sostanzialmente la stessa cosa che facevo io, ma con le parole.

		return block;
		
	}

	checkRef(block, data_ref) {
		console.log("block, data_ref", block, data_ref);
		if (block.ref === data_ref) {
			return block;
		}
	}

	getLines(rendered, wrapper, renderedBounding){
		
		let renderedHeight = renderedBounding.height;
		let end =  wrapper.right;

		let walker = walk(rendered.firstChild, rendered);

		let next, done, node;

		let currentLeft, currentY, currentRight, currentWidth;
		let currentHeight = 0;
		let lines = [];
		let line;
		let left = 0;
		let y = 0;
		let right = 0;
		let width = 0;

		while(!done){
			
			next = walker.next();
			done = next.done;
			node = next.value;

			if(node){

				let pos = getBoundingClientRect(node);
				let posLines = getClientRects(node);

				let posRight = pos.right;

				console.log(pos);

				if(isText(node) &&
				node.textContent.trim().length &&
				window.getComputedStyle(node.parentNode)["break-inside"] !== "avoid"){

					if(lines.length == 0){
						y = posLines[0].y;
					}
					

					for(let i  = 0; i < posLines.length; i++){
						
						line = posLines[i];

						currentLeft = line.left; 
						currentY = line.y;
						currentRight = line.right;
						currentWidth = line.width;

						if(currentLeft <= left){
							
							let newLine = {
								height : 0,
								right : 0,
								width: 0
							};

							newLine.height = currentY - y;
							newLine.right = right;
							newLine.width = width;
							
							lines.push(newLine);

							left = currentLeft;
							y = currentY;
							right = currentRight;	
							width = currentWidth;						

							currentHeight = currentHeight + lines[lines.length - 1].height;

						}else{

							left = currentLeft;
							
							if(y > currentY){
								y = currentY;
							}

							right = currentRight;
							width = width + currentWidth;							

						}	
					}
				}

				if(posRight < end){
					next = nodeAfter(node, rendered);
				 if(next) {
						walker = walk(next, rendered);
					}
				}
			}else{

				let lastLine = {
					height : 0,
					right : 0,
					width: 0
				};
		
				lastLine.height = renderedHeight - currentHeight;
				lastLine.right = currentRight;
				lastLine.width = width;

				lines.push(lastLine);
			}
		}

		return lines;
	}

	getBoundingDivRect(node,source,wrapper){



	}


	getSequence(blocks, bounds = this.bounds) {

		let A = []; // Array di sequenze
		let pageHeight = bounds.height;
		let complete;

		for (let index = 0; index < blocks.length; index++) {
			//creo l'array di sequenze e itero all'interno.
			//all'inizio inserisco subito tutto dentro.
			//const [index, block] of blocks.entries()

			let block = blocks[index];

			if (index == 0) { //Se è il primo blocco devo creare le tre sequenze iniziali da cui poi far partire l'iterazione
				let i = 0;
				for (let u = 0 ; u < block.length ; u ++) {

					let prop = block[u];

					//Creo le prime tre sequenze

					let sequence = {
						blocks: 0,
						score: 1,
						current_page_height: 0,
						current_lines: 0,
						lastBlock_type: "",
						pages: []
					};

					//Crea il blocco prendendo le informazioni da prop

					let firstBlock = this.addBlock(index, prop);

					sequence.blocks = 1;
					sequence.current_page_height = prop.height;
					sequence.current_lines = prop.lines.length;
					sequence.lastBlock_type = prop.type;

					//Aggiungo alla sequenza le informazioni sul blocco aggiunto
					A.push(sequence);
					let newPage = [];

					A[i].pages.push(newPage);
					A[i].pages[0].push(firstBlock);

					i++;

				}

			} else {


				let solutionsLength = A.length;
				console.log("solutionLength", solutionsLength);

				for (let i = 0; i < solutionsLength; i++) {

					for (let u = 0 ; u < block.length ; u ++) {

						let prop = block[u];
						
						let clonedArray = A.slice(0, 1);
						let clonedObject = clonedArray[0];
						let referenceSequence = JSON.parse(JSON.stringify(clonedObject)); //Faccio una copia della sequenza di riferimento

						let currentHeight = referenceSequence.current_page_height;
						let current_lines = referenceSequence.current_lines;

						let currentPage = referenceSequence.pages.length;

						let currentPosition = currentPage % 2 === 0 ? "left" : "right";

						if(prop.break_before === "right"){
							if(currentPosition === "right"){

								//Aggiungo una pagina bianca

								let blankPage = [];

								referenceSequence.pages.push(blankPage);

								let newPage = [];

								referenceSequence.pages.push(newPage);

								currentHeight = 0;
								current_lines = 0;

							}else{
							
								let newPage = [];

								referenceSequence.pages.push(newPage);

								currentHeight = 0;
								current_lines = 0;
							}
						}

						if (currentHeight + prop.height < pageHeight) {

							let paragraph = this.addBlock(index, prop);

							referenceSequence = this.updateSequence(referenceSequence,currentHeight,prop,current_lines,paragraph);

							A.push(referenceSequence);

						} else {

							let score = this.calcScore(currentHeight, pageHeight, prop, blocks, index);

							if (score.score > 0) {

								complete = false;

								let beforeBreakPar = this.addBlock(index, prop, complete);
								let afterBreakPar = this.addBlock(index, prop, complete);

								let newPage = [];

								if(score.linesBefore != 0){
									beforeBreakPar.lines = score.linesBefore;
									beforeBreakPar.height = prop.height - score.overflow;

									//Aggiungo il blocco beforeBreak
									referenceSequence.pages[referenceSequence.pages.length - 1].push(beforeBreakPar);
								}

								afterBreakPar.lines = score.linesAfter;
								afterBreakPar.height = score.overflow;
								afterBreakPar.complete = true;

								//Aggiungo la nuova pagina con il blocco afterBreak
								newPage.push(afterBreakPar);
								referenceSequence.pages.push(newPage);

								//Aggiorno le informazioni della sequenza
								referenceSequence = this.updateSequence(referenceSequence,currentHeight,prop,current_lines,afterBreakPar,score);

								A.push(referenceSequence);
							}


						}
					}
					A.shift();
				}

				for (let u = 0; u < A.length; u++) {

					let lastScore = A[u].score;
					let lastCurrentPageHeight = A[u].current_page_height;

					for (let j = u + 1; j < A.length; j++) {
						if (lastCurrentPageHeight == A[j].current_page_height) {
							let lastScoreNext = A[j].score;

							if (lastScore > lastScoreNext) {
								A.splice(j, 1); //Elimino l'elemento di J con lo score più basso
							} else {
								if (lastScore == lastScoreNext) {

									let lastType = A[u].lastBlock_type;
									let lastTypeNext = A[j].lastBlock_type;

									if (lastType === "normal" && lastTypeNext === "normal") { //Se sono entrambe normal elimino random una delle due

										let int = this.getRandomInt(2);

										if (int == 0) {
											A.splice(u, 1);
										} else {
											A.splice(j, 1);
										}

									} else {
										if (lastType === "normal") {
											A.splice(j, 1);
										} else {
											if (lastTypeNext === "normal") {
												A.splice(u, 1);
											} else {

												let int = this.getRandomInt(2);

												if (int == 0) {
													A.splice(u, 1);
												} else {
													A.splice(j, 1);
												}

											}
										}
									}
								} else {
									A.splice(u, 1); //Altrimenti elimino U
								}
							}
						}
					}

				}

			}

		}

		let bestSequence = this.getBestSequence(A);

		console.log(A, bestSequence);
		return bestSequence[0];
	}


	getRandomInt(max) {
		return Math.floor(Math.random() * Math.floor(max));
	}

	addBlock(index, prop, complete = true) {

		let paragraph = {
			block: 0,
			tag: "",
			ref: "",
			lines: 0,
			height: 0,
			type: "",
			complete: true
		};

		paragraph.block = index;
		paragraph.tag = prop.tagName;
		paragraph.ref = prop.ref;
		paragraph.type = prop.type;

		if (!complete) {
			paragraph.complete = false;
		} else {
			paragraph.lines = prop.lines.length;
			paragraph.height = prop.height;
		}

		return paragraph;
	}

	updateSequence(referenceSequence,currentHeight,prop,current_lines,paragraph, score = undefined){

		if(score != undefined){

			referenceSequence.score = score.score;
			referenceSequence.blocks += 1;
			referenceSequence.current_page_height = score.overflow;
			referenceSequence.current_lines = score.linesAfter;
			referenceSequence.lastBlock_type = prop.type;

		}else{

			referenceSequence.blocks = referenceSequence.blocks + 1;
			referenceSequence.current_page_height = currentHeight + prop.height;
			referenceSequence.current_lines = current_lines + paragraph.lines;
			referenceSequence.lastBlock_type = prop.type;
			referenceSequence.pages[referenceSequence.pages.length - 1].push(paragraph);

		}

		return referenceSequence;
	}

	getBestSequence(A) {

		let bestSequence = A.concat();

		for (let u = 0; u < bestSequence.length; u++) {

			let lastScore = bestSequence[u].score;

			for (let j = u + 1; j < bestSequence.length; j++) {

				let lastScoreNext = bestSequence[j].score;

				if (lastScore > lastScoreNext) {
					bestSequence.splice(j, 1); //Elimino l'elemento di J con lo score più basso
				} else {
					if (lastScore == lastScoreNext) {

						let lastType = bestSequence[u].lastBlock_type;
						let lastTypeNext = bestSequence[j].lastBlock_type;

						if (lastType === "normal" && lastTypeNext === "normal") { //Se sono entrambe normal elimino random una delle due

							let int = this.getRandomInt(2);

							if (int == 0) {
								bestSequence.splice(u, 1);
							} else {
								bestSequence.splice(j, 1);
							}

						} else {
							if (lastType === "normal") {
								bestSequence.splice(j, 1);
							} else {
								if (lastTypeNext === "normal") {
									bestSequence.splice(u, 1);
								} else {

									let int = this.getRandomInt(2);

									if (int == 0) {
										bestSequence.splice(u, 1);
									} else {
										bestSequence.splice(j, 1);
									}

								}
							}
						}
					} else {
						bestSequence.splice(u, 1); //Altrimenti elimino U
					}
				}
			}
		}
		return bestSequence;
	}




	breakAt(node, offset = 0) {
		return {
			node,
			offset
		};
	}

	//Fa un check da utils/dom.js se è segnalato un break 
	shouldBreak(node) {
		let previousSibling = node.previousSibling;
		let parentNode = node.parentNode;
		let parentBreakBefore = needsBreakBefore(node) && parentNode && !previousSibling && needsBreakBefore(parentNode);
		let doubleBreakBefore;

		if (parentBreakBefore) {
			doubleBreakBefore = node.dataset.breakBefore === parentNode.dataset.breakBefore;
		}

		return !doubleBreakBefore && needsBreakBefore(node) || needsPreviousBreakAfter(node) || needsPageBreak(node);
	}

	getStart(source, breakToken) {
		let start;
		let node = breakToken && breakToken.node;

		if (node) {
			start = node;
		} else {
			start = source.firstChild; //Prende il primo capitolo
		}

		return start;
	}

	appendModified(node, dest, shallow = true) {

		let clone = cloneNode(node, !shallow); //clona sempre il nodo, sostanzialmente
		if (node.parentNode && isElement(node.parentNode)) {
			let parent = findElement(node.parentNode, dest);
			if (parent) {
				parent.appendChild(clone);
			} else {
				if (!parent) {
					dest.appendChild(clone);
				}
			}
		}
		else {
			let previousSibling = (node.previousSibling) ? true : false;
			if(previousSibling && node.previousSibling.tagName === "SECTION"){
				
				dest.appendChild(clone);
				clone.previousSibling.remove();

			}else{
				dest.appendChild(clone);
			}
			
			
		}

		return clone;
	}

	//Clona il nodo della pagina.

	append(node, dest, breakToken, shallow = true, rebuild = true) {

		let clone = cloneNode(node, !shallow); //clona sempre il nodo, sostanzialmente
		if (node.parentNode && isElement(node.parentNode)) {
			let parent = findElement(node.parentNode, dest); //dest è sostanzialmente la destinazione ovvero dove deve essere attaccato
			console.log("Parent in append", parent, dest); //Non trova il parent all'interno della pagina per il breaktoken. Quindi, va reinserito
			// Rebuild chain
			if (parent) {
				parent.appendChild(clone);
				console.log("appendChild", clone);
			} else if (rebuild) { //Rebuild ancestor serve per ricostruire e reinerire il breaktoken
				let fragment = rebuildAncestors(node);
				console.log("rebuildAncestors fragment", fragment);
				parent = findElement(node.parentNode, fragment); //Gli ho aggiunto i p e section
				console.log(parent);
				if (!parent) {
					dest.appendChild(clone);
				} else if (breakToken && isText(breakToken.node) && breakToken.offset > 0) {
					clone.textContent = clone.textContent.substring(breakToken.offset); //substring partendo dall'offset del breaktoken.
					parent.appendChild(clone);
				} else {
					parent.appendChild(clone);
				}

				dest.appendChild(fragment);
			} else {
				dest.appendChild(clone);
			}


		} else {
			dest.appendChild(clone);
		}

		/*let nodeHooks = this.hooks.renderNode.triggerSync(clone, node);
		nodeHooks.forEach((newNode) => {
			if (typeof newNode != "undefined") {
				clone = newNode;
			}
		});*/

		this.getStyle(clone.parentNode);

		return clone;
	}

	getStyle(node){

		console.log("node.firstChild",node);

		if (isText(node.firstChild)) {
			let data_ref = node.getAttribute("data-ref");
			console.log("rendered.data-ref", data_ref);
			let exist = false;
			let found;

			for (let i = 0; i < this.fit.pages.length; i++) {

				let checkRef = (block) => block.ref === data_ref;

				found = this.fit.pages[i].findIndex(checkRef);

				if (found != -1) {
					console.log(found);
					exist = true;
					var pageNum = i;
					break;
				}
			}


			if (exist) {

				let rects = getClientRects(node.firstChild);
				let rect;
				for (var i = 0; i != rects.length; i++) {
					rect = rects[i];
					console.log("rect heigt", rect);
				}

				if (this.fit.pages[pageNum][found].type === "expand") {
					let elementStyle = window.getComputedStyle(node, null).getPropertyValue('word-spacing');
					let currentSize = parseFloat(elementStyle);
					node.style.wordSpacing = (currentSize + 0.05) + 'px';
				}

				if (this.fit.pages[pageNum][found].type === "reduced") {
					let elementStyle = window.getComputedStyle(node, null).getPropertyValue('word-spacing');
					let currentSize = parseFloat(elementStyle);
					node.style.wordSpacing = (currentSize - 1) + 'px';
				}
			}

			console.log("exist", exist);
		}

	}

	async waitForImages(imgs) {
		let results = Array.from(imgs).map(async (img) => {
			return this.awaitImageLoaded(img);
		});
		await Promise.all(results);
	}

	async awaitImageLoaded(image) {
		return new Promise(resolve => {
			if (image.complete !== true) {
				image.onload = function () {
					let { width, height } = window.getComputedStyle(image);
					resolve(width, height);
				};
				image.onerror = function (e) {
					let { width, height } = window.getComputedStyle(image);
					resolve(width, height, e);
				};
			} else {
				let { width, height } = window.getComputedStyle(image);
				resolve(width, height);
			}
		});
	}

	avoidBreakInside(node, limiter) {
		let breakNode;

		if (node === limiter) {
			return;
		}

		while (node.parentNode) {
			node = node.parentNode;

			if (node === limiter) {
				break;
			}

			if (window.getComputedStyle(node)["break-inside"] === "avoid") {
				breakNode = node;
				break;
			}

		}
		return breakNode;
	}

	createBreakToken(overflow, rendered, source) {
		let container = overflow.startContainer; //il nodo di partenza
		console.log("Container Overflow ", container);
		let offset = overflow.startOffset; //L'offset di pagina dell'overflow
		console.log("startOffeset", offset);
		let node, renderedNode, parent, index, temp;

		if (isElement(container)) {
			temp = child(container, offset);

			if (isElement(temp)) {
				renderedNode = findElement(temp, rendered);

				if (!renderedNode) {
					// Find closest element with data-ref
					renderedNode = findElement(prevValidNode(temp), rendered);
					return;
				}

				node = findElement(renderedNode, source);
				offset = 0;
			} else {
				renderedNode = findElement(container, rendered);

				if (!renderedNode) {
					renderedNode = findElement(prevValidNode(container), rendered);
				}

				parent = findElement(renderedNode, source);
				index = indexOfTextNode(temp, parent);
				node = child(parent, index);
				offset = 0;
			}
		} else {
			renderedNode = findElement(container.parentNode, rendered); //Trova il nodo renderizzato all'interno della pagina.

			if (!renderedNode) {
				renderedNode = findElement(prevValidNode(container.parentNode), rendered);
			}

			parent = findElement(renderedNode, source); //trova quel nodo nella source
			index = indexOfTextNode(container, parent); // trova il numero del figlio, sempre nella source

			if (index === -1) {
				return;
			}

			node = child(parent, index); //ritorna il figlio

			console.log("node.textContent.indexOf", node.textContent.indexOf(container.textContent));

			offset += node.textContent.indexOf(container.textContent); //All'offset aggiunge la posizione del figlio.
		}

		if (!node) {
			return;
		}

		return {
			node,
			offset
		};

	}

	//Cerca il BreakToken in base all'overflow

	findBreakToken(rendered, source, bounds=this.bounds, extract=true) {
		let overflow = this.findOverflow(rendered, bounds);
		let breakToken;

		let overflowHooks = this.hooks.onOverflow.triggerSync(overflow, rendered, bounds, this);
		overflowHooks.forEach((newOverflow) => {
			if (typeof newOverflow != "undefined") {
				overflow = newOverflow;
			}
		});

		if (overflow) {
			breakToken = this.createBreakToken(overflow, rendered, source);

			let breakHooks = this.hooks.onBreakToken.triggerSync(breakToken, overflow, rendered, this);
			breakHooks.forEach((newToken) => {
				if (typeof newToken != "undefined") {
					breakToken = newToken;
				}
			});


			if (breakToken && breakToken.node && extract) {
				this.removeOverflow(overflow);
			}

		}
		return breakToken;
	}

	hasOverflow(element, bounds = this.bounds) {
		let constrainingElement = element && element.parentNode; // this gets the element, instead of the wrapper for the width workaround
		let { width } = element.getBoundingClientRect();
		let scrollWidth = constrainingElement ? constrainingElement.scrollWidth : 0; //The Element.scrollWidth read-only property is a measurement of the width of an element's content, including content not visible on the screen due to overflow.
		return Math.max(Math.floor(width), scrollWidth) > Math.round(bounds.width);
	}

	findOverflow(rendered, bounds=this.bounds) {
		if (!this.hasOverflow(rendered, bounds)) return; //Se la grandezza dell'elemento, non supera la grandezza 
		
		let start = Math.round(bounds.left);
		let end =  Math.round(bounds.right);
		let range;

		let walker = walk(rendered.firstChild, rendered);

		// Find Start
		let next, done, node, offset, skip, breakAvoid, prev, br;
		while (!done) {
			next = walker.next();
			done = next.done;
			node = next.value;
			skip = false;
			breakAvoid = false;
			prev = undefined;
			br = undefined;

			if (node) {
				let pos = getBoundingClientRect(node);
				let left = Math.floor(pos.left);
				let right = Math.floor(pos.right);

				if (!range && left >= end) {
					// Check if it is a float
					let isFloat = false;

					if (isElement(node) ) {
						let styles = window.getComputedStyle(node); //Prende il CSS del nodo
						isFloat = styles.getPropertyValue("float") !== "none";
						skip = styles.getPropertyValue("break-inside") === "avoid";
						breakAvoid = node.dataset.breakBefore === "avoid" || node.dataset.previousBreakAfter === "avoid";
						prev = breakAvoid && nodeBefore(node, rendered);
						br = node.tagName === "BR" || node.tagName === "WBR";
						
					}

					if (prev) {
						range = document.createRange();
						range.setStartBefore(prev);
						break;
					}
					//Entra qui quando il paragrafo è perfetto
					if (!br && !isFloat && isElement(node)) {
						range = document.createRange();
						range.setStartBefore(node); //The Range.setStartBefore() method sets the start position of a Range relative to another Node. The parent Node of the start of the Range will be the same as that for the referenceNode.
						break;
					}

					if (isText(node) && node.textContent.trim().length) {
						range = document.createRange();
						range.setStartBefore(node);
						break;
					}

				}

				if (!range && isText(node) &&
						node.textContent.trim().length &&
						window.getComputedStyle(node.parentNode)["break-inside"] !== "avoid") {
					let rects = getClientRects(node);					
					let rect;
					left = 0;
					for (var i = 0; i != rects.length; i++) {
						rect = rects[i];
						if (rect.width > 0 && (!left || rect.left > left)) {
							left = rect.left;
						}
						console.log("rect_break",rect);
					}
					//Quando fa overflow entra qui
					if(left >= end) {
						//Il nodo di riferimento è il paragrafo già tagliato
						range = document.createRange();
						offset = this.textBreak(node, start, end); //Ritorna lo startoffset
						if (!offset) {
							range = undefined;
						} else {
							//Setta l'inizio del range dall nodo segnato che è quello di fine pagina e l'offset trovato fin dove arriva il testo
							range.setStart(node, offset);
						}
						break;
					}
				}

				// Skip children
				if (skip || right < end) {
					next = nodeAfter(node, rendered);
					if (next) {
						walker = walk(next, rendered);
					}

				}

			}
		}

		// Find End
		if (range) { //Ritorna fin dove arriva la fine della pagina
			range.setEndAfter(rendered.lastChild);
			return range;
		}

	}

	findEndToken(rendered, source, bounds = this.bounds) {
		if (rendered.childNodes.length === 0) {
			return;
		}

		let lastChild = rendered.lastChild;

		let lastNodeIndex;
		while (lastChild && lastChild.lastChild) {
			if (!validNode(lastChild)) {
				// Only get elements with refs
				lastChild = lastChild.previousSibling;
			} else if (!validNode(lastChild.lastChild)) {
				// Deal with invalid dom items
				lastChild = prevValidNode(lastChild.lastChild);
				break;
			} else {
				lastChild = lastChild.lastChild;
			}
		}

		if (isText(lastChild)) {

			if (lastChild.parentNode.dataset.ref) {
				lastNodeIndex = indexOf(lastChild);
				lastChild = lastChild.parentNode;
			} else {
				lastChild = lastChild.previousSibling;
			}
		}

		let original = findElement(lastChild, source);

		if (lastNodeIndex) {
			original = original.childNodes[lastNodeIndex];
		}

		let after = nodeAfter(original);

		return this.breakAt(after);
	}
	//Trova il punto di break ciclando le parole e poi le lettere
	//Nella nuova versione trova anche il numero di righe prima e dopo il break
	/*textBreak(node, start, end) {
		let wordwalker = words(node);
		let left = 0;
		let right = 0;
		let top, currentTop, lastTop = 0;
		//let line_height = 0;
		let lineNum = 0;
		let lineAfterBreak = 0;
		let lineBeforeBreak = 0;
		let word, next, done, pos;
		let offset;

		while (!done) {
			next = wordwalker.next();
			word = next.value;
			done = next.done;
			//Mi calcola quante righe prima e dopo il break.
			if (!word) {
				lineAfterBreak = lineNum - (lineBeforeBreak);
				this.paragraph.lineNum = lineNum;
				this.paragraph.lineAfterBreak = lineAfterBreak;
				this.paragraph.offset = offset;
				this.paragraph.lineBeforeBreak = lineBeforeBreak;
				done = true;
				console.log("paragraph", this.paragraph);
				break;
			}

			pos = getBoundingClientRect(word);
			left = Math.floor(pos.left);
			right = Math.floor(pos.right);

			if (top == 0) {
				lastTop = Math.floor(pos.top);
			}
			else {
				currentTop = Math.floor(pos.top);
				if (lastTop != currentTop) {
					lastTop = currentTop;
					lineNum = lineNum + 1;

					if (offset == undefined) {
						lineBeforeBreak = lineNum - 1;
					}
				}
			}

			line_height = Math.floor(pos.bottom) - Math.floor(pos.top); //Altezza di riga




			//Finché left non supera end, quindi c'è ancora spazio per inserire, l'offset si sposta. 

			if (left >= end && offset == undefined) {
				this.paragraph.offset = word.startOffset;
			}

			if (right > end && offset == undefined) {
				let letterwalker = letters(word);
				let letter, nextLetter, doneLetter;

				while (!doneLetter) {
					nextLetter = letterwalker.next();
					letter = nextLetter.value;
					doneLetter = nextLetter.done;

					if (!letter) {
						break;
					}

					pos = getBoundingClientRect(letter);
					left = Math.floor(pos.left);

					if (left >= end) {
						offset = letter.startOffset;
						//done = true;

						break;
					}
				}
			}

		}

	}*/

	textBreak(node, start, end) {
		let wordwalker = words(node);
		let left = 0;
		let right = 0;
		let word, next, done, pos;
		let offset;
		while (!done) {
			next = wordwalker.next();
			word = next.value;
			done = next.done;
			if (!word) {
				break;
			}

			pos = getBoundingClientRect(word);
			left = Math.floor(pos.left);
			right = Math.floor(pos.right);

			//Finché left non supera end, quindi c'è ancora spazio per inserire, l'offset si sposta. 

			if (left >= end) {
				offset = word.startOffset;
				break;
			}

			if (right > end) {
				let letterwalker = letters(word);
				let letter, nextLetter, doneLetter;

				while (!doneLetter) {
					nextLetter = letterwalker.next();
					letter = nextLetter.value;
					doneLetter = nextLetter.done;

					if (!letter) {
						break;
					}

					pos = getBoundingClientRect(letter);
					left = Math.floor(pos.left);

					if (left >= end) {
						offset = letter.startOffset;
						done = true;

						break;
					}
				}
			}

		}

		return offset;
	}

	calcScore(currentHeight, pageHeight, prop, blocks, index) {

		let lines = prop.lines;
		let score;
		let linesBefore = 0;
		let linesAfter;
		let lineNum = lines.length;
		let overflow = 0;

		if(lines.length == 1 && blocks[index+1][0].break_before === "right"){
			return score = 0.2;
		}

		if (lines.length == 1) {
			score = 1;
			linesAfter = 1;
			linesBefore = 0;
			overflow = prop.height;
			return {
				score,
				linesAfter,
				linesBefore,
				overflow
			};
		} else {
			if (lines.length <= 3) {
				return score = 0;
			} else {
				let lineHeight;
				let breakParHeight = 0;
				let next;
				for (let i = 0; i < lines.length; i++) { //Anche un ciclo while. 
					
					next = lines[i+1];

					if(next != undefined){

						lineHeight = lines[i].height;

						currentHeight = currentHeight + lineHeight;

						if (currentHeight > pageHeight) {
							linesAfter = lineNum - linesBefore;
							overflow = prop.height - breakParHeight;
							break;
						}

						breakParHeight = breakParHeight + lineHeight;
						console.log("breakParHeight",breakParHeight);

						linesBefore += 1;
					}
					else{
						linesAfter = 1;
					}
					console.log("lineHeight, currentHeight, pageHeight", lineHeight, currentHeight, pageHeight);
				}

				switch (lineNum - linesAfter) {
					case 0:
						score = 1;
						break;
					case 1:
						score = 0.0;
						break;
					case 2:
						score = 0.7;
						break;
					case lineNum - 2:
						score = 0.7;
						break;
					case lineNum - 1:
						score = 0.0;
						break;
					case lineNum:
						score = 1;
						break;
					/*case lineNum + 1:
						score = 1;*/
					default:
						score = 0.8;
				}
			}
		}

		return {
			score,
			linesAfter,
			linesBefore,
			overflow
		};

	}



	removeOverflow(overflow) {
		let { startContainer } = overflow;
		let extracted = overflow.extractContents();

		this.hyphenateAtBreak(startContainer);

		return extracted;
	}

	hyphenateAtBreak(startContainer) {
		if (isText(startContainer)) {
			let startText = startContainer.textContent;
			let prevLetter = startText[startText.length - 1];

			// Add a hyphen if previous character is a letter or soft hyphen
			if (/^\w|\u00AD$/.test(prevLetter)) {
				startContainer.parentNode.classList.add("pagedjs_hyphen");
				startContainer.textContent += "\u2011";
			}
		}
	}
}

EventEmitter(Layout.prototype);

export default Layout;
