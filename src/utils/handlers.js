import pagedMediaHandlers from "../modules/paged-media/index";
import generatedContentHandlers from "../modules/generated-content/index";
import EventEmitter from "event-emitter";
import pipe from "event-emitter/pipe";

let registeredHandlers = [...pagedMediaHandlers, ...generatedContentHandlers];

class Handlers {
	constructor(chunker, polisher, fitter, caller) {
		let handlers = [];

		registeredHandlers.forEach((Handler) => {
			let handler = new Handler(chunker, polisher, fitter, caller);
			
			handlers.push(handler);
			pipe(handler, this);
		});
	}
}

EventEmitter(Handlers.prototype);

export function registerHandlers() {
	for (var i = 0; i < arguments.length; i++) {
		registeredHandlers.push(arguments[i]);
	}
}

export function initializeHandlers(chunker, polisher, fitter, caller) {
	let handlers = new Handlers(chunker, polisher, fitter, caller);
	return handlers;
}
