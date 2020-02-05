import EventEmitter from "event-emitter";

class Handler {
	constructor(chunker, polisher, fitter, caller) {
		let hooks = Object.assign({}, chunker && chunker.hooks, polisher && polisher.hooks, fitter && fitter.hooks, caller && caller.hooks);
		this.chunker = chunker;
		this.polisher = polisher;
		this.fitter = fitter;
		this.caller = caller;

		for (let name in hooks) {
			if (name in this) {
				let hook = hooks[name];
				hook.register(this[name].bind(this));
			}
		}
	}
}

EventEmitter(Handler.prototype);

export default Handler;
