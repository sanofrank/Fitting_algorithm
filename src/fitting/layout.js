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
	hasTextContent
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
		
		


		/*this.blockEx = {
			width : 0,
			height : 0,
			left : 0,
			right: 0,
			lines: []
		}

		this.blockRed = {
			width : 0,
			height : 0,
			left : 0,
			right: 0,
			lines: []
		}*/

		this.pages = {
			blocks: 0,
			score: 0,
			current_page_height: 0,
			pages : [],
		}

		this.paragraph = {
			block: 0,
			tag: "",
			ref: "",
			lines: 0,
			type: "",
			complete: true
		}

		/*this.paragraph = {
			lineNum: 0,
			lineAfterBreak: 0,
			lineBeforeBreak: 0,
			offset: 0,
			numBreak: 0,
		};*/

	}

	//METODO MODIFICATO
	async renderTo(wrapper, source, breakToken, bounds=this.bounds) {
		//Al primo giro, la source è il capitolo e il breakToken è false
		let start = this.getStart(source, breakToken);
		console.log("Start BreakToken",start);
		//Start è il capitolo all'inizio
		let walker = walk(start, source); //start: l'oggetto d'attraversare, source The "className" for the root object

		let node;
		let done;
		let next;

		let blocks = [];

		let iterator = 0;

		


		



		let hasRenderedContent = false;
		let newBreakToken;

		let length = 0;

		while (!done) { //finchè non trova un nuovo breaktoken continua a girare
			next = walker.next(); //Scorre gli elementi di source
			node = next.value; //Prende il valore HTML
			console.log("next.value", node);
			done = next.done; //true una volta terminato (callback)

			if (!node) { 
				this.hooks && this.hooks.layout.trigger(wrapper, this);
				let imgs = wrapper.querySelectorAll("img");
				if (imgs.length) { //Se è un' immagine, cerca la grandezza
					await this.waitForImages(imgs); 
				}
				
				newBreakToken = this.findBreakToken(wrapper, source, bounds);

				return blocks;
			}

			//this.hooks && this.hooks.layoutNode.trigger(node);

			// Check if the rendered element has a break set
			//Ad esempio i tag section
			if (hasRenderedContent && this.shouldBreak(node)) {

				this.hooks && this.hooks.layout.trigger(wrapper, this);

				let imgs = wrapper.querySelectorAll("img");
				if (imgs.length) {
					await this.waitForImages(imgs);
				}
				newBreakToken = this.findBreakToken(wrapper, source, bounds);

				if (!newBreakToken) {
					newBreakToken = this.breakAt(node);
				}

				length = 0;

				break;
			}

			// Should the Node be a shallow or deep clone
			let shallow = isContainer(node); //Valore boolean che si attiva nel caso sia un tipo DIV
			console.log(node,wrapper,"Breaktoken", breakToken,shallow);
			//console.log("breakToken", breakToken); //Il breakToken è il paragrafo intero che va tagliato.
			let rendered = this.appendModified(node, wrapper, shallow);
			console.log("rendered.textContent",rendered);

			//Se è testo prendo le informazioni e rimuovo il blocco dalla pagina.
			if(isText(rendered.firstChild)){
						console.log("isText", rendered.textContent);

						let normBlock =  {
							tagName: "",
							ref: "",
							width : 0,
							height : 0,
							left : 0,
							right: 0,
							lines: []
						}

						let exBlock =  {
							tagName: "",
							ref: "",
							width : 0,
							height : 0,
							left : 0,
							right: 0,
							lines: []
						}

						let redBlock =  {
							tagName: "",
							ref: "",
							width : 0,
							height : 0,
							left : 0,
							right: 0,
							lines: []
						}

						let blockVer = {
							normal: {},
							expand: {},
							reduced: {}
						};

						//Crea un blocco nuovo ogni iterazione

						let chapterTitle = false;
						let renderedBounding = rendered.getBoundingClientRect();
						console.log(isText(rendered.firstChild));
						let lines = getClientRects(rendered.firstChild); //La length sono le righe
						console.log("node",rendered);
						console.log("lines",lines);
						let parent = rendered.parentNode.tagName;

						if(parent == "HEADER"){	
							renderedBounding = rendered.parentElement.getBoundingClientRect();
							chapterTitle = true;
						}

						normBlock.tagName = rendered.tagName;
						console.log(normBlock.tagName);
						normBlock.ref = rendered.getAttribute("data-ref");
						normBlock.width = renderedBounding.width; 
						normBlock.height = renderedBounding.height;
						normBlock.left = renderedBounding.left;
						normBlock.right = renderedBounding.right;

						let line;

						for (var i = 0; i != lines.length; i++) { //ogni riga.
							line = lines[i];
							console.log(line.width, lines.length);
							normBlock.lines.push(line);
						}; //Sostanzialmente la stessa cosa che facevo io, ma con le parole.

						console.log("block",normBlock);

						blocks.push(blockVer);

						blocks[iterator].normal = normBlock;
						

						
						console.log("blocks",blocks);

						if(chapterTitle){

							blocks[iterator].expand = normBlock;
							blocks[iterator].reduced = normBlock;
							
							rendered.parentNode.remove();
							rendered.remove();

						}else{

							//Expand	
							console.log("expand");
							let elementStyle = window.getComputedStyle(rendered, null).getPropertyValue('word-spacing');
        					let currentSize = parseFloat(elementStyle);
							rendered.style.wordSpacing = (currentSize + 0.05) + 'px';

							renderedBounding = rendered.getBoundingClientRect();
							lines = getClientRects(rendered.firstChild);

							exBlock.tagName = rendered.tagName;
							exBlock.ref = rendered.getAttribute("data-ref");
							exBlock.width = renderedBounding.width; 
							exBlock.height = renderedBounding.height;
							exBlock.left = renderedBounding.left;
							exBlock.right = renderedBounding.right;

							for (var i = 0; i != lines.length; i++) { //ogni riga.
								line = lines[i];
								exBlock.lines.push(line);
								
							};

							blocks[iterator].expand = exBlock;

							console.log("EXPAND", blocks[iterator].expand.height,blocks[iterator].expand.lines[lines.length-1].width);

							//Reduce

							rendered.style.wordSpacing = (currentSize - 0.05) + 'px';
							
							renderedBounding = rendered.getBoundingClientRect();
							lines = getClientRects(rendered.firstChild);

							redBlock.tagName = rendered.tagName;
							redBlock.ref = rendered.getAttribute("data-ref");
							redBlock.width = renderedBounding.width; 
							redBlock.height = renderedBounding.height;
							redBlock.left = renderedBounding.left;
							redBlock.right = renderedBounding.right;

							for (var i = 0; i != lines.length; i++) { //ogni riga.
								line = lines[i];
								redBlock.lines.push(line);
							};

							blocks[iterator].reduced = redBlock;
							rendered.remove();
						}
						
						iterator = iterator +1;

						};	

			//length += rendered.textContent.length; //Textlength in page, Prende solo la lunghezza del testo, se ha un container, giustamente non prende niente
			console.log("length",length);
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
			if (length >= this.maxChars) {

				this.hooks && this.hooks.layout.trigger(wrapper, this);

				let imgs = wrapper.querySelectorAll("img");
				if (imgs.length) {
					await this.waitForImages(imgs);
				}

				newBreakToken = this.findBreakToken(wrapper, source, bounds);

				if (newBreakToken) {
					length = 0;
				}
			}

		}
		console.log(blocks);
		return blocks;
		//return newBreakToken;
	}


	getSequence(blocks,wrapper,contents,bounds=this.bounds){

		let i = 0;
		let A = []; // Array di sequenze
		let temp = [];
		let pageHeight = bounds.height;
		let pages = 0;

		for(const [index,block] of blocks.entries()){
			//creo l'array di sequenze e itero all'interno.
			//all'inizio inserisco subito tutto dentro. 
			if(index == 0){ //Se è il primo blocco devo creare le tre sequenze iniziali da cui poi far partire l'iterazione
				for(let prop of Object.entries(block)){

					if (block.hasOwnProperty(prop[0])) {

						let sequence = {
							blocks: 0,
							score: 1,
							current_page_height: 0,
							current_lines: 0,
							pages: [[]]
						}
	
						let firstBlock = this.paragraph;
	
						firstBlock.block = index;
						firstBlock.tag = prop[1].tagName;
						firstBlock.ref = prop[1].ref;
						console.log(prop.tagName);
						firstBlock.lines = prop[1].lines.length;
	
						switch(prop[0]){
							case "normal":
								firstBlock.type = "normal";
								break;
							case "expand":
								firstBlock.type = "expand";
								break;
							case "reduce":
								firstBlock.type = "reduce";
								break;
						};
	
						firstBlock.complete = true;					
	
						A.push(sequence);
						
						//Aggiungo alla sequenza le informazioni sul blocco aggiunto
						A[i].blocks = 1;
						A[i].current_page_height = prop[1].height;
						A[i].current_lines = prop[1].lines.length;
						console.log(A[i]);
						A[i].pages[0].push(firstBlock);
	
						i++;
						console.log(firstBlock);
						console.log("A",A);
					}
					
				}
			}else{
				i = 0;
				for(const [ p , sequence] of A.entries()){

					let currentHeight = sequence.current_page_height;
					let current_lines = sequence.current_lines;

					for(let prop of Object.entries(block)){

						if(currentHeight + prop[1].height < pageHeight){
							
							let paragraph = {
								block: 0,
								tag: "",
								ref: "",
								lines: 0,
								type: "",
								complete: true
							}
		
							paragraph.block = index;
							paragraph.tag = prop[1].tagName;
							paragraph.ref = prop[1].ref;
							paragraph.lines = prop[1].lines.length;
							
							switch(i){
								case 0:
									paragraph.type = "normal";
									break;
								case 1:
									paragraph.type = "expand";
									break;
								case 2:
									paragraph.type = "reduce";
									break;
							};
		
							paragraph.complete = true;
							
							temp.push(sequence);
							console.log(temp[temp.length - 1].pages[temp[temp.length-1].pages.lenght - 1]);
							temp[temp.length - 1].pages[temp[temp.length-1].pages.lenght - 1].push(paragraph);

							//A.push(prop);
							temp[temp.length - 1].current_page_height = currentHeight + prop.height;
							temp[temp.length - 1].current_lines = current_lines + paragraph.lines;
							
						}else{	
							let overflow = currentHeight - pageHeight;
							let	score = this.calcScore(currentHeight,pageHeight,prop[1].lines);
							
							if(score.score <= 0){
								console.log("non l'aggiungo nemmeno a temp")
							}else{

								//Creo il paragrafo before

								let beforeBreakPar = this.paragraph;
								let afterBreakPar = this.paragraph;

								let newPage = [];
		
								beforeBreakPar.block = index;
								beforeBreakPar.tag = prop[1].tagName;
								beforeBreakPar.ref = prop[1].ref;
								beforeBreakPar.lines = score.linesBefore;
							
								switch(i){
									case 0:
										beforeBreakPar.type = "normal";
										break;
									case 1:
										beforeBreakPar.type = "expand";
										break;
									case 2:
										beforeBreakPar.type = "reduce";
										break;
								};
			
								beforeBreakPar.complete = false;

								temp.push(sequence);
								temp[temp.length - 1].pages[temp.pages.lenght - 1][temp.pages[temp.pages.length -1].length - 1].push(beforeBreakPar);

								//Creo il paragrafo After

								afterBreakPar.block = index;
								afterBreakPar.tag = prop.tagName;
								afterBreakPar.ref = prop.ref;
								afterBreakPar.lines = score.linesAfter;
							
								switch(i){
									case 0:
										afterBreakPar.type = "normal";
										break;
									case 1:
										afterBreakPar.type = "expand";
										break;
									case 2:
										afterBreakPar.type = "reduce";
										break;
								};
			
								afterBreakPar.complete = true;

								temp[temp.length - 1].pages.push(newPage);
								temp[temp.length - 1].pages[temp.pages.lenght - 1][temp.pages[temp.pages.length -1].length - 1].push(afterBreakPar);


								//Aggiorno le informazioni della sequenza

								temp[temp.length - 1].score = score.score;
								temp[temp.length - 1].current_page_height = overflow;
								temp[temp.length - 1].current_lines = afterBreakPar.lines;
							}
									
									
								}	
							}
					
					//A.shift();
				}

				for(let u = 0; u < temp.length; u++ ){

					let lastScore = temp[u].score;
					let lastType = temp[u].pages[temp.pages.length-1][temp.pages[temp.pages.length - 1]].type;
					let lastCurrentPageHeight = temp[u].current_page_height; 

					for(let j = u + 1; j < temp.length; j++){

					if(lastCurrentPageHeight != temp[j].current_page_height){
						console.log("sono diversi e li tengo entrambi")
					}else{
						let lastScoreNext = temp[j].score;

						if(lastScore > lastScoreNext){
							temp.splice(j,1); //Elimino l'elemento di J con lo score più basso
						}else{
							if(lastScore == lastScoreNext){

								let lastTypeNext = temp[j].pages[temp.pages.length-1][temp.pages[temp.pages.length - 1]].type;
								
								if(lastTypeNext != "normal"){
									temp.splice(j,1);
								}else{
									temp.splice(u,1);
								}
							}else{
								temp.splice(u,1); //Altrimenti elimino U
							}
						}
					}
				}

				if(temp[u] != undefined){
					A.push(temp[u]);
				}

			}

			while(temp.length > 0) { //Svuoto temp
				temp.pop();
			}
			

			}

		}

		return A;
	}


			
					

					

		

	


	breakAt(node, offset=0) {
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

	appendModified(node,dest,shallow=true){
		
		let clone = cloneNode(node, !shallow); //clona sempre il nodo, sostanzialmente
		if(node.parentNode && isElement(node.parentNode)){
			let parent = findElement(node.parentNode,dest);
		if(parent){
			parent.appendChild(clone);
		}else{
			if(!parent){
				dest.appendChild(clone)
				}
			}
		}
		else{
			dest.appendChild(clone);
		}

		return clone;
	}
	//Clona il nodo della pagina.

	append(node, dest, breakToken, shallow=true, rebuild=true) {

		let clone = cloneNode(node, !shallow); //clona sempre il nodo, sostanzialmente
		if (node.parentNode && isElement(node.parentNode)) {
			let parent = findElement(node.parentNode, dest); //dest è sostanzialmente la destinazione ovvero dove deve essere attaccato
			console.log("Parent in append",parent, dest); //Non trova il parent all'interno della pagina per il breaktoken. Quindi, va reinserito
			// Rebuild chain
			if (parent) {
				parent.appendChild(clone);
				console.log("appendChild", clone);
			} else if (rebuild) { //Rebuild ancestor serve per ricostruire e reinerire il breaktoken
				let fragment = rebuildAncestors(node);
				console.log("rebuildAncestors fragment",fragment);
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

		return clone;
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
				image.onload = function() {
					let { width, height } = window.getComputedStyle(image);
					resolve(width, height);
				};
				image.onerror = function(e) {
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

			if(window.getComputedStyle(node)["break-inside"] === "avoid") {
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
		console.log("startOffeset",offset);
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

			console.log("node.textContent.indexOf",node.textContent.indexOf(container.textContent));

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
		console.log("FIND BREAKTOKEN rendered",rendered);
		
		let overflow = this.findOverflow(rendered, bounds); //Ritorna il range di pagina
		let breakToken;

		/*let overflowHooks = this.hooks.onOverflow.triggerSync(overflow, rendered, bounds, this);
		overflowHooks.forEach((newOverflow) => {
			if (typeof newOverflow != "undefined") {
				overflow = newOverflow;
			}
		});*/

		if (overflow) {
			breakToken = this.createBreakToken(overflow, rendered, source);
			console.log(breakToken);
			/*let breakHooks = this.hooks.onBreakToken.triggerSync(breakToken, overflow, rendered, this);
			breakHooks.forEach((newToken) => {
				if (typeof newToken != "undefined") {
					breakToken = newToken;
				}
			});*/


			if (breakToken && breakToken.node && extract) {
				this.removeOverflow(overflow);
			}

		}
		return breakToken;
	}
	hasOverflow(element, bounds=this.bounds) {
		let constrainingElement = element && element.parentNode; // this gets the element, instead of the wrapper for the width workaround
		let { width } = element.getBoundingClientRect();
		let scrollWidth = constrainingElement ? constrainingElement.scrollWidth : 0; //The Element.scrollWidth read-only property is a measurement of the width of an element's content, including content not visible on the screen due to overflow.
		return Math.max(Math.floor(width), scrollWidth) > Math.round(bounds.width);
	}

	findOverflow(rendered, bounds=this.bounds) {
		if (!this.hasOverflow(rendered, bounds)) return; //Se non fa Overflow entra. 
		
		let start = Math.round(bounds.left); //inizio e fine del range del tag in overflow
		let end =  Math.round(bounds.right);
		let range;
		let score = 0;
		let maxHeight = 0;
		console.log("rendered.firstChild in FindOverflow",rendered.firstChild);
		let walker = walk(rendered.firstChild, rendered); //rendered è il wrapper in questo caso, quindi prende tutto la section interna

		// Find Start . Inizia a scorrere dentro il wrapper
		let next, done, node, offset, skip, breakAvoid, prev, br;
		while (!done) {
			next = walker.next(); //Prende sempre il valore successivo.
			done = next.done;
			node = next.value;
			skip = false;
			breakAvoid = false;
			prev = undefined;
			br = undefined;

			if (node) {
				let pos = getBoundingClientRect(node); //Grandezza del Nodo intero
				console.log("bounds",this.bounds);
				maxHeight += pos.height;
				console.log("getBoundingClientRects",pos);		
				let rects = getClientRects(node); //La length sono le righe
				console.log("Rects",rects);
				let left = Math.floor(pos.left);
				let right = Math.floor(pos.right);
				console.log("range" ,range);

				if (!range && left >= end) { //Entra qui solo se tutto il blocco è più grande.
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
					console.log("getBoundingClientRects Break",pos);		
					rects = getClientRects(node); //La length sono le righe
					console.log("Rects Break",rects);
					let rect;
					left = 0;
					for (var i = 0; i != rects.length; i++) { //ogni riga.
						rect = rects[i];
						
						if (rect.width > 0 && (!left || rect.left > left)) { //width è quanto spazio ha in riga.
							left = rect.left; //left è la posizione di sinistra della riga  
							console.log("left",left); //Quando si sposta, vuol dire che si è cambiato pagina.
						} //Sostanzialmente la stessa cosa che facevo io, ma con le parole.

					}

					//A questo punto posso inserire qui l'algoritmo per calcolare lo score.

					//Quando fa overflow entra qui
					if(left >= end) {
						console.log("In Overflow",node);
						range = document.createRange();
						//offset = this.textBreak(node, start, end); //Ritorna lo startoffset della prima parola che fa overflow
						this.textBreak(node, start, end); //trova dov'è effettivamente il break
						//score = this.calcScore(this.paragraph.lineAfterBreak, this.paragraph.lineBeforeBreak,this.paragraph.lineNum);
						//Prova per far cambiare word spacing
						/*if(score == 0.7){
							let item = node.parentNode;
							let elementStyle = window.getComputedStyle(item, null).getPropertyValue('word-spacing');
        					let currentSize = parseFloat(elementStyle);
							console.log(currentSize);
							item.style.wordSpacing = (currentSize + 0.05) + 'px';
							}*/
						console.log("score", score);
						offset = this.paragraph.offset;
						if (!offset) {
							range = undefined;
						} else {
							//Setta l'inizio del range dall nodo segnato che è quello di fine pagina e l'offset trovato fin dove arriva il testo
							range.setStart(node, offset);
							console.log("Node,offset in else range ",node,offset);
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
			console.log("rendered.lastchild",rendered, rendered.lastChild);
			range.setEndAfter(rendered.lastChild); //A questo punto prende come End del range il lastChild del div di pagina.
			console.log("range",range);
			console.log("maxHeight",maxHeight);
			return range; //Ritorna il range di pagina.
		}

	}


	findEndToken(rendered, source, bounds=this.bounds) {
		if (rendered.childNodes.length === 0) {
			return;
		}

		let lastChild = rendered.lastChild;

		let lastNodeIndex;
		while (lastChild && lastChild.lastChild) {
			if (!validNode(lastChild)) {
				// Only get elements with refs
				lastChild = lastChild.previousSibling;
			} else if(!validNode(lastChild.lastChild)) {
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
	textBreak(node, start, end) {
		let wordwalker = words(node);
		let left = 0;
		let right = 0;
		let top, currentTop, lastTop = 0;
		let line_height = 0;
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
				console.log("paragraph",this.paragraph);
				break;
			}

			pos = getBoundingClientRect(word);
			left = Math.floor(pos.left);
			right = Math.floor(pos.right);
			
			if(top == 0){
				lastTop = Math.floor(pos.top);
			}
			else{
				currentTop = Math.floor(pos.top);
				if(lastTop != currentTop){
					lastTop = currentTop;
					lineNum = lineNum + 1;

					if(offset == undefined){
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

	}

	calcScore(currentHeight,pageHeight,lines){

		let score;
		let overflow = currentHeight - pageHeight;
		let linesBefore = 0;
		let linesAfter;
		let lineNum = lines.length;

		if(lines.length == 1){
			score = 1;
			linesAfter = 1;
			linesBefore = 0;
			return {
				score,
				linesAfter,
				linesBefore};
		}else {
			if(lines.length <= 3){
				 score = 0;
				 return score;
			}else{
				for(const line of lines){ //Anche un ciclo while. 
					if(currentHeight >= pageHeight){
						linesAfter = lineNum - linesBefore;	
						break
					}
					currentHeight = currentHeight + line.height;
					linesBefore = linesBefore + 1;
				}
					
				switch(lineNum - linesAfter){
					case 0:
						score = 0.2;
						break
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
					default :
						score = 0.8;						
				}
			}
		}

		return {
			score,
			linesAfter,
			linesBefore
		};
	
	}
		
	

	removeOverflow(overflow) {
		let {startContainer} = overflow;
		let extracted = overflow.extractContents();

		this.hyphenateAtBreak(startContainer);

		return extracted;
	}

	hyphenateAtBreak(startContainer) {
		if (isText(startContainer)) {
			let startText = startContainer.textContent;
			let prevLetter = startText[startText.length-1];

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
