import { VERSION as convertVersion } from "@vcards-io/convert";
import { VERSION as jscontactVersion } from "@vcards-io/jscontact";
import { VERSION as vcardVersion } from "@vcards-io/vcard";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

/** Application shell. Milestone 0: proves the toolchain wires up end to end. */
@customElement("vc-app")
export class VcApp extends LitElement {
	static override styles = css`
		:host {
			display: block;
			font-family: system-ui, sans-serif;
			padding: 1rem;
		}
	`;

	override render() {
		return html`
			<h1>vcards-io</h1>
			<p>Milestone 0 scaffold.</p>
			<ul>
				<li>@vcards-io/vcard ${vcardVersion}</li>
				<li>@vcards-io/jscontact ${jscontactVersion}</li>
				<li>@vcards-io/convert ${convertVersion}</li>
			</ul>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"vc-app": VcApp;
	}
}
