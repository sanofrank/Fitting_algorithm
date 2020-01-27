import { UUID } from "../utils/utils";
import { isElement } from "../utils/dom";

/**
 * Render a flow of text offscreen
 * Va a prendere nodo per nodo del dom e aggiunge data-ref o data-id 
 * Il fatto che sia offscreen è molto importante e mi sarà utile per l'algoritmo
 * @class
 */
class ContentParser {

	constructor(content, cb) {
		if (content && content.nodeType) {
			// handle dom
			this.dom = this.add(content);
		} else if (typeof content === "string") { //Se è testo
			this.dom = this.parse(content);
		}

		return this.dom;
	}

	parse(markup, mime) {
		let range = document.createRange();
		let fragment = range.createContextualFragment(markup);

		this.addRefs(fragment);
		this.removeEmpty(fragment);

		return fragment;
	}

	add(contents) { //Se è un tag
		// let fragment = document.createDocumentFragment();
		//
		// let children = [...contents.childNodes];
		// for (let child of children) {
		// 	let clone = child.cloneNode(true);
		// 	fragment.appendChild(clone);
		// }

		this.addRefs(contents);
		this.removeEmpty(contents);

		return contents;
	}

	addRefs(content) {
		//TreeWalker per percorrere il DOM
		var treeWalker = document.createTreeWalker(
			content,
			NodeFilter.SHOW_ELEMENT,
			{ acceptNode: function(node) { return NodeFilter.FILTER_ACCEPT; } },
			false
		);

		let node = treeWalker.nextNode();
		while(node) { //fintanto che trova un nodo nel DOM gli aggiunge i data-ref e data-id

			if (!node.hasAttribute("data-ref")) {
				let uuid = UUID();
				node.setAttribute("data-ref", uuid); //Aggiunge un UUID al paragrafo
			}

			if (node.id) {
				node.setAttribute("data-id", node.id); //Se ha un id gli fornisce anche quello
			}

			// node.setAttribute("data-children", node.childNodes.length);

			// node.setAttribute("data-text", node.textContent.trim().length);
			node = treeWalker.nextNode();
		}
	}

	removeEmpty(content) {
		var treeWalker = document.createTreeWalker(
			content,
			NodeFilter.SHOW_TEXT,
			{ acceptNode: function(node) {
				// Only remove more than a single space
				if (node.textContent.length > 1 && !node.textContent.trim()) { //TRIM function returns a text value with the leading and trailing spaces removed.

					// Don't touch whitespace if text is preformated
					let parent = node.parentNode;
					let pre = isElement(parent) && parent.closest("pre");
					if (pre) {
						return NodeFilter.FILTER_REJECT;
					}

					return NodeFilter.FILTER_ACCEPT;
				} else {
					return NodeFilter.FILTER_REJECT;
				}
			} },
			false
		);

		let node;
		let current;
		node = treeWalker.nextNode();
		while(node) {
			current = node;
			node = treeWalker.nextNode();
			// if (!current.nextSibling || (current.nextSibling && current.nextSibling.nodeType === 1)) {
			current.parentNode.removeChild(current);
			// }
		}
	}

	find(ref) {
		return this.refs[ref];
	}

	// isWrapper(element) {
	//   return wrappersRegex.test(element.nodeName);
	// }

	isText(node) {
		return node.tagName === "TAG";
	}

	isElement(node) {
		return node.nodeType === 1;
	}

	hasChildren(node) {
		return node.childNodes && node.childNodes.length;
	}


	destroy() {
		this.refs = undefined;
		this.dom = undefined;
	}
}

export default ContentParser;
