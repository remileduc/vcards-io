// Anonymizer for Android (com.android.vcard) vCard 2.1 exports.
// Usage: node scripts/anonymize-vcf.mjs <in.vcf> <out.vcf>
// Keeps structure, encodings, folding and byte lengths; replaces every value.

import crypto from "node:crypto";
import fs from "node:fs";

const [, , inPath, outPath] = process.argv;
const SALT = "vcards-io-fixture-2026-11-06";

function rng(seed) {
	let s = crypto.createHash("sha256").update(`${SALT}|${seed}`).digest().readUInt32LE(0);
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function digitsOf(r, n, noLeadZero) {
	let s = "";
	for (let i = 0; i < n; i++) s += String(Math.floor(r() * 10));
	if (noLeadZero && n > 0 && s[0] === "0") s = String(1 + Math.floor(r() * 9)) + s.slice(1);
	return s;
}

const orig = fs.readFileSync(inPath);
const text = orig.toString("latin1");
if (!text.endsWith("\r\n") || text.replace(/\r\n/g, "").includes("\n"))
	throw new Error("line endings");
const phys = text.slice(0, -2).split("\r\n");

function parse(lines) {
	const items = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === "") throw new Error(`unexpected blank line ${i + 1}`);
		const colon = line.indexOf(":");
		const head = line.slice(0, colon);
		const value = line.slice(colon + 1);
		const params = head.split(";").slice(1);
		if (params.includes("ENCODING=QUOTED-PRINTABLE")) {
			let raw = value;
			while (raw.endsWith("=")) {
				if (i + 1 >= lines.length)
					throw new Error(`soft break at end of input, line ${i + 1}`);
				raw = raw.slice(0, -1) + lines[++i];
			}
			const comps = raw.split(";").map((c) => {
				if (!c.includes("=")) return { literal: true, text: c };
				if (!/^(=[0-9A-F]{2})+$/.test(c)) throw new Error(`mixed QP component: ${head}`);
				return {
					literal: false,
					text: Buffer.from(c.replace(/=/g, ""), "hex").toString("utf8"),
				};
			});
			items.push({ kind: "qp", head, comps });
		} else if (params.includes("ENCODING=BASE64")) {
			let b64 = value;
			while (lines[i + 1]?.startsWith(" ")) b64 += lines[++i].slice(1);
			if (lines[++i] !== "") throw new Error(`photo without trailing blank line at ${i + 1}`);
			const bytes = Buffer.from(b64, "base64");
			if (bytes.toString("base64") !== b64) throw new Error("non-canonical base64");
			items.push({ kind: "b64", head, bytes });
		} else items.push({ kind: "plain", head, value });
	}
	return items;
}

function encodeQP(str) {
	let out = "";
	let lineCount = 0;
	for (const b of Buffer.from(str, "utf8")) {
		out += `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
		lineCount += 3;
		if (lineCount >= 67) {
			out += "=\r\n";
			lineCount = 0;
		}
	}
	return out;
}
function serialize(items) {
	let out = "";
	for (const it of items) {
		if (it.kind === "plain") out += `${it.head}:${it.value}\r\n`;
		else if (it.kind === "qp")
			out += `${it.head}:${it.comps.map((c) => (c.literal ? c.text : encodeQP(c.text))).join(";")}\r\n`;
		else {
			const s = `${it.head}:${it.bytes.toString("base64")}`;
			let folded = "";
			let lineCount = 0;
			let max = 73;
			for (const ch of s) {
				folded += ch;
				if (++lineCount > max) {
					folded += "\r\n ";
					max = 72;
					lineCount = 0;
				}
			}
			out += `${folded}\r\n\r\n`;
		}
	}
	return Buffer.from(out, "latin1");
}

const items = parse(phys);
if (!serialize(items).equals(orig)) throw new Error("round-trip of the original is not byte-exact");
console.log(`round-trip OK: ${items.length} properties`);

const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const hasAccent = (s) => /\P{ASCII}/u.test(s);
const blen = (s) => Buffer.byteLength(s, "utf8");
// Only grammar, address, country, family and generic words survive. No institution or profession.
const STOP = new Set(
	`rue avenue av bd boulevard chemin ch route rte place pl impasse allee allees des de du la le les l d bis ter
	appartement appt apt bat batiment etage residence res cedex saint sainte st ste sur sous en et aux a au lieu dit
	chez villa quai cours square hameau lotissement lot porte escalier esc code digicode interphone boite bp cs entree
	fond cour gauche droite rdc rez chaussee zone industrielle za zi zac parc
	france suisse switzerland belgique canada allemagne germany espagne italie italy royaume uni usa etats unis pays bas
	luxembourg monaco maroc algerie tunisie quebec
	papa maman mamie papy papi mamy tonton tata oncle tante cousin cousine frere soeur voisin voisine proprio
	proprietaire travail boulot perso pro mobile fixe domicile maison ancien ancienne nouveau nouvelle vrai vraie pas
	ne repondre spam arnaque inconnu numero ou mr mme mlle m monsieur madame the and of other
	anniversaire mariage naissance fete deces retraite`
		.split(/\s+/)
		.filter(Boolean),
);
const GIVEN =
	`Jean Paul Luc Marc Anne Marie Pierre Louis Jules Hugo Lina Emma Lucas Nathan Manon Camille Claire Julie
Sophie Thomas Nicolas Antoine Maxime Alice Sarah Laura Tom Eva Noa Yanis Mathis Arthur Gabriel Adam Louise Jade Rose
Agathe Victor Oscar Simon Margot Romain Vincent Olivier Benoit Laurent Philippe Christophe Fabien Damien Florian
Quentin Baptiste Guillaume Alexandre Isabelle Nathalie Sandrine Virginie Caroline Delphine Pauline Charlotte Mathilde
Justine Marine Morgane Adrien Kevin Dylan Enzo Matteo Ethan Sacha Lou Mia Nina Ava Elsa Anna Lena Maya Iris Axel Noah
Liam Ali Omar Sami Nour Amel Yasmine Karim Mehdi Rachid Samir Leila Fatima Khadija Ibrahim Christopher Marguerite
Constantin Alexandrine Maximilien Christelle Christiane Dominique Bernadette Jacqueline Antoinette Marjolaine
Emmanuelle Wilhelmine Maximilienne Bastien Corentin Gaspard Augustin Timothee Valentin Martin Robin Elliot Marius
Ambre Capucine Victoire Garance Apolline Juliette Romane Faustine Ludivine Amandine Marion Lucie Oriane Solene
Tiphaine Alix Yann Erwan Gwen Brieuc Tugdual Malo Ewen Nolan Milo Eliot Ilan Rayan Ayoub Idris Bilal Amine Wassim
Nael Ilyes Kenza Salma Rania Imane Sana Dina Lila Ines Zoe Leo Theo Chloe Elise Elodie Aurelie Oceane Sebastien
Frederic Raphael Clemence Clement Felix Jerome Helene Celine Melanie Stephanie Veronique Valerie Cecile Emilie Emile
Eugenie Genevieve Clementine Benedicte Therese Irene Agnes Andrea Loic Mael Gael Joel Noel Anais Remi Remy Jeremie
Jeremy Gerard Gerald Leon Leonie Leandre Leonard Eleonore Penelope Severine Angelique Frederique Berenice Melissa
Edouard Edith Eric Elie Eloise Heloise Zelie Noemie Desire Aurele Gwenaelle Raphaelle Michele Danielle Josiane`.split(
		/\s+/,
	);
const GIVEN_ACC =
	`Léa Zoé Léo Inès Théo Noé Noémie Élise Éva Chloé Aurélie Élodie Océane Sébastien Frédéric Raphaël
Clémence Clément Félix Jérôme Hélène Céline Mélanie Stéphanie Véronique Valérie Cécile Émilie Émile Eugénie Geneviève
Clémentine Bénédicte Thérèse Irène Agnès Andréa Andréas Loïc Maël Gaël Ismaël Joël Noël Anaïs Maïa Désiré Aurèle
Rémi Rémy Jérémie Jérémy Gérard Gérald Léon Léonie Léandre Léonard Éléonore Pénélope Séverine Angélique Frédérique
Bérénice Mélissa Médéric Édouard Édith Éric Élie Éloïse Héloïse Zélie Gwenaëlle Raphaëlle Michèle Mickaël Nathanaël
Azraël Gaëtan Gaëlle Maëlle Maëlys Maëva Anaëlle Joëlle Noëlle Adèle Ève Évelyne Bérangère Amélie Aurélien
Sébastienne Frédérick Cédric Grégory Grégoire Jérémiah Léonore Océanne Mélodie Mélina Célia Célestine Célestin Désirée`.split(
		/\s+/,
	);
const SURNAME =
	`Martin Bernard Thomas Petit Robert Richard Durand Dubois Moreau Laurent Simon Michel Lefebvre Leroy
Roux David Bertrand Morel Fournier Girard Bonnet Dupont Lambert Fontaine Rousseau Vincent Muller Lefevre Faure Andre
Mercier Blanc Guerin Boyer Garnier Chevalier Francois Legrand Gauthier Garcia Perrin Robin Clement Morin Nicolas Henry
Roussel Mathieu Gautier Masson Marchand Duval Denis Dumont Marie Lemaire Noel Meyer Dufour Meunier Brun Blanchard
Giraud Joly Riviere Lucas Brunet Gaillard Barbier Arnaud Martinez Gerard Roche Renard Schmitt Roy Leroux Colin Vidal
Caron Picard Roger Fabre Aubert Lemoine Renaud Dumas Lacroix Olivier Philippe Bourgeois Pierre Benoit Rey Leclerc
Payet Rolland Leclercq Guillaume Lecomte Lopez Jean Dupuy Guillot Hubert Berger Carpentier Sanchez Dupuis Moulin
Louis Deschamps Huet Vasseur Perez Boucher Fleury Royer Klein Jacquet Adam Paris Poirier Marty Aubry Guyot Carre
Charles Renault Charpentier Menard Maillard Baron Bertin Bailly Herve Schneider Fernandez Collet Leger Bouvier Julien
Prevost Millet Perrot Daniel Cousin Germain Breton Besson Langlois Remy Pelletier Leveque Perrier Leblanc Barre
Lebrun Marchal Weber Mallet Hamon Boulanger Jacob Monnier Michaud Rodriguez Guichard Gillet Etienne Grondin Poulain
Tessier Chevallier Collin Chauvin Bouchet Gay Lemaitre Benard Marechal Humbert Reynaud Antoine Hoarau Perret
Barthelemy Cordier Pichon Lejeune Gilbert Lamy Delaunay Pasquier Carlier Laporte Vandenberghe Desjardins Lagrange
Beauchamp Montgolfier Castellane Rochefort Kowalczyk Brandstetter Schwarzkopf Delacroix Beaumarchais Montmorency
Rochambeau Lamoureux Letourneau Villeneuve Lamontagne Courtemanche Charbonneau Toussaint Lacombe Bousquet Rossi
Ferrari Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti Costa Fontana Moretti Rizzo Lombardi Nguyen Tran
Le Pham Hoang Vu Dang Bui Do Ho Ngo Duong Ly Kim Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang`.split(
		/\s+/,
	);
const SURNAME_ACC =
	`Gérard Rémy Léger Hervé Bénard Étienne Lévêque Maréchal Barthélemy Lemaître Prévost Carré Guérin
André Clément Noël Rivière François Béranger Ménard Pérez Léonard Bézier Sénéchal Préaux Châtelain Chênevert Dupré
Fouré Génin Lévy Médard Nédélec Pélissier Réal Théry Védrine Chéreau Lefébure Mégret Déroulède Thévenot Rémond
Lefèvre Brière Vallée Mérieux Tréguier Ségur Démare Bézard Crémieux Léveillé Désiré Égly Trémolières Gérardin
Péron Férey Guérard Bérard Bédard Côté Gagné Tremblay Lévesque Thériault Côme Jérémie Rémillard Généreux Rhéaume`.split(
		/\s+/,
	);

const V = "aeiou";
const C = "bcdfglmnprstvz";
const ACC = "éèêàïô";
function pseudoWord(r, byteLen, accented) {
	if (byteLen <= 0) return "";
	if (accented && byteLen === 2) return pick(r, ACC);
	const chars = accented ? byteLen - 1 : byteLen;
	let w = "";
	let cons = r() < 0.7;
	while (w.length < chars) {
		w += cons ? pick(r, C) : pick(r, V);
		cons = !cons;
	}
	if (accented) {
		const idx = [...w].map((c, i) => (V.includes(c) ? i : -1)).filter((i) => i >= 0);
		const i = idx.length ? pick(r, idx) : 0;
		w = w.slice(0, i) + pick(r, ACC) + w.slice(i + 1);
	}
	return w;
}
function applyCase(fake, model) {
	if (model.length > 1 && model === model.toUpperCase() && model !== model.toLowerCase())
		return fake.toUpperCase();
	if (model[0] !== model[0].toLowerCase())
		return fake[0].toUpperCase() + fake.slice(1).toLowerCase();
	return fake.toLowerCase();
}
const isStop = (t) => t.length === 1 || STOP.has(fold(t));
const originalKeys = new Set();
const roleOf = new Map();
const usedFakes = new Set();
const nameMap = new Map();
const wordMap = new Map();

function fakeName(token, defaultRole) {
	const key = fold(token);
	if (nameMap.has(key)) return applyCase(nameMap.get(key), token);
	const role = roleOf.get(key) ?? defaultRole;
	const len = blen(token);
	const acc = hasAccent(token);
	const pool = role === "surname" ? (acc ? SURNAME_ACC : SURNAME) : acc ? GIVEN_ACC : GIVEN;
	const r = rng(`name|${role}|${key}`);
	const cands = pool.filter(
		(n) =>
			blen(n) === len &&
			hasAccent(n) === acc &&
			!originalKeys.has(fold(n)) &&
			!usedFakes.has(fold(n)),
	);
	let fake = cands.length ? pick(r, cands) : null;
	for (let k = 0; !fake || usedFakes.has(fold(fake)) || originalKeys.has(fold(fake)); k++)
		fake = pseudoWord(rng(`name|${role}|${key}|${k}`), len, acc);
	usedFakes.add(fold(fake));
	nameMap.set(key, fake.toLowerCase());
	return applyCase(fake, token);
}
function fakeWord(token) {
	const key = fold(token);
	if (!wordMap.has(key)) {
		let fake;
		for (let k = 0; !fake || originalKeys.has(fold(fake)); k++)
			fake = pseudoWord(rng(`word|${key}|${k}`), blen(token), hasAccent(token));
		wordMap.set(key, fake);
	}
	return applyCase(wordMap.get(key), token);
}
const fakeDigits = (run, ctx) => digitsOf(rng(`digits|${ctx}|${run}`), run.length, run.length <= 3);
function rewriteText(s, ctx, letterFn) {
	return s.replace(/\p{L}+|\p{N}+/gu, (t) =>
		/\p{N}/u.test(t) ? fakeDigits(t, ctx) : isStop(t) ? t : letterFn(t),
	);
}
const asNames = (s, ctx) => rewriteText(s, ctx, (t) => fakeName(t, "given"));
const asWords = (s, ctx) => rewriteText(s, ctx, fakeWord);

const origYears = new Set();
function fakeDate(v) {
	const r = rng(`date|${v}`);
	const mm = String(1 + Math.floor(r() * 12)).padStart(2, "0");
	const dd = String(1 + Math.floor(r() * 28)).padStart(2, "0");
	if (/^--\d\d-\d\d$/.test(v)) return `--${mm}-${dd}`;
	if (!/^\d{4}-\d\d-\d\d$/.test(v)) throw new Error(`unexpected date ${v}`);
	let year;
	do year = String(1940 + Math.floor(r() * 72));
	while (origYears.has(year));
	return `${year}-${mm}-${dd}`;
}

const usedTels = new Set();
function fakeTel(v) {
	const digits = v.replace(/\D/g, "");
	for (let k = 0; ; k++) {
		const r = rng(`tel|${v}|${k}`);
		let fake;
		if (v.startsWith("+33") && digits.length === 11) {
			const fiction = {
				1: "19900",
				2: "26191",
				3: "35301",
				4: "46571",
				5: "53649",
				6: "63998",
				7: "63998",
			};
			fake = `33${fiction[digits[2]] ?? digits[2] + digitsOf(r, 4)}${digitsOf(r, 4)}`;
		} else if (v.startsWith("+1") && digits.length === 11) {
			fake = `1${2 + Math.floor(r() * 8)}${digitsOf(r, 2)}55501${digitsOf(r, 2)}`;
		} else if (v.startsWith("+")) {
			const cc = /^\+[17]/.test(v) ? 1 : 2;
			fake = digits.slice(0, cc) + digitsOf(r, digits.length - cc, true);
		} else fake = digitsOf(r, digits.length, true);
		if (usedTels.has(fake)) continue;
		usedTels.add(fake);
		let i = 0;
		return v.replace(/\d/g, () => fake[i++]);
	}
}

const KEEP_DOMAINS = new Set(
	`gmail.com hotmail.fr hotmail.com yahoo.fr yahoo.com outlook.fr outlook.com msn.com live.fr live.com gmx.fr
	gmx.com icloud.com me.com protonmail.com proton.me aol.com example.com example.org example.net`
		.split(/\s+/)
		.filter(Boolean),
);
function fakeEmail(v) {
	const at = v.lastIndexOf("@");
	if (at < 0) throw new Error(`bad email ${v}`);
	const local = v.slice(0, at);
	const domain = v.slice(at + 1).toLowerCase();
	const fakeLocal = local.replace(/[A-Za-z]+|[0-9]+/g, (t) => {
		if (/[0-9]/.test(t)) return fakeDigits(t, "email");
		const known = nameMap.get(fold(t));
		return applyCase(fold(known ?? fakeWord(t)), t);
	});
	const fakeDomain = KEEP_DOMAINS.has(domain)
		? domain
		: pick(rng(`domain|${domain}`), ["example.com", "example.org", "example.net"]);
	return `${fakeLocal}@${fakeDomain}`;
}
function fakeUrl(v) {
	const m = /^([a-z]+:\/\/)([^/]+)(.*)$/i.exec(v);
	if (!m) throw new Error(`bad url ${v}`);
	const labels = m[2].split(".");
	const host = labels
		.map((l, i) => (i === labels.length - 1 || l === "www" ? l : asWords(l, "url")))
		.join(".");
	return `${m[1]}${host}${asWords(m[3], "url")}`;
}

// minimal baseline JPEG encoder, DC-only blocks
function huffTable(bits, vals) {
	const map = new Map();
	let code = 0;
	let k = 0;
	for (let len = 1; len <= 16; len++) {
		for (let i = 0; i < bits[len - 1]; i++) map.set(vals[k++], { code: code++, len });
		code <<= 1;
	}
	return map;
}
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const AC_VALS = [0x00, 0xf0];
const DC = huffTable(DC_BITS, DC_VALS);
const AC = huffTable(AC_BITS, AC_VALS);
function makeJpeg(w, h, colorAt, targetSize) {
	const seg = (marker, payload) =>
		Buffer.concat([
			Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
			payload,
		]);
	const app0 = seg(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
	const dqt = seg(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 8)]));
	const sof = seg(
		0xc0,
		Buffer.from([8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]),
	);
	const dht = seg(
		0xc4,
		Buffer.from([0x00, ...DC_BITS, ...DC_VALS, 0x10, ...AC_BITS, ...AC_VALS]),
	);
	const sos = seg(0xda, Buffer.from([3, 1, 0, 2, 0, 3, 0, 0, 63, 0]));
	const bytes = [];
	let cur = 0;
	let n = 0;
	const put = (val, len) => {
		for (let i = len - 1; i >= 0; i--) {
			cur = (cur << 1) | ((val >> i) & 1);
			if (++n === 8) {
				bytes.push(cur);
				if (cur === 0xff) bytes.push(0);
				cur = 0;
				n = 0;
			}
		}
	};
	const prev = [0, 0, 0];
	for (let by = 0; by < Math.ceil(h / 8); by++)
		for (let bx = 0; bx < Math.ceil(w / 8); bx++) {
			const [r, g, b] = colorAt(bx, by);
			const ycc = [
				0.299 * r + 0.587 * g + 0.114 * b,
				-0.1687 * r - 0.3313 * g + 0.5 * b + 128,
				0.5 * r - 0.4187 * g - 0.0813 * b + 128,
			];
			for (let c = 0; c < 3; c++) {
				const dc = Math.max(-128, Math.min(127, Math.round(ycc[c]) - 128));
				const diff = dc - prev[c];
				prev[c] = dc;
				const cat = diff === 0 ? 0 : Math.floor(Math.log2(Math.abs(diff))) + 1;
				put(DC.get(cat).code, DC.get(cat).len);
				if (cat) put(diff < 0 ? (diff - 1) & ((1 << cat) - 1) : diff, cat);
				put(AC.get(0).code, AC.get(0).len);
			}
		}
	if (n) put((1 << (8 - n)) - 1, 8 - n);
	const core = [
		Buffer.from([0xff, 0xd8]),
		app0,
		dqt,
		sof,
		dht,
		sos,
		Buffer.from(bytes),
		Buffer.from([0xff, 0xd9]),
	];
	const coreLen = core.reduce((a, b) => a + b.length, 0);
	const pad = targetSize - coreLen;
	if (pad >= 4 && pad - 2 <= 0xffff) {
		const note = Buffer.alloc(pad - 4, 0x20);
		note.write(
			"vcards-io: synthetic avatar, padding keeps the original byte size",
			0,
			"latin1",
		);
		core.splice(2, 0, seg(0xfe, note));
	}
	return Buffer.concat(core);
}
function avatar(seedHex, size) {
	const r = rng(`photo|${seedHex}`);
	const hue = r() * 360;
	const hsl = (h, s, l) => {
		const a = s * Math.min(l, 1 - l);
		const f = (k) => {
			const x = (k + h / 30) % 12;
			return Math.round(255 * (l - a * Math.max(-1, Math.min(x - 3, 9 - x, 1))));
		};
		return [f(0), f(8), f(4)];
	};
	const bg = hsl(hue, 0.5, 0.42);
	const fg = hsl(hue, 0.35, 0.9);
	return makeJpeg(
		96,
		96,
		(bx, by) => {
			const head = (bx - 5.5) ** 2 + (by - 3.5) ** 2 <= 2.3 ** 2;
			const body = by >= 7 && Math.abs(bx - 5.5) <= 2.4 + (by - 7) * 0.45;
			return head || body ? fg : bg;
		},
		size,
	);
}

const compsOf = (it) =>
	it.kind === "qp" ? it.comps.map((c) => c.text) : it.kind === "plain" ? it.value.split(";") : [];
for (const it of items) {
	const name = it.head.split(";")[0];
	const comps = compsOf(it);
	if (name === "N")
		for (const [i, c] of comps.entries())
			for (const t of c.match(/\p{L}+/gu) ?? [])
				if (!isStop(t) && !roleOf.has(fold(t)))
					roleOf.set(fold(t), i === 0 ? "surname" : "given");
	for (const c of comps) if (/^\d{4}-\d\d-\d\d$/.test(c)) origYears.add(c.slice(0, 4));
	if (name === "TEL") usedTels.add(it.value.replace(/\D/g, ""));
	if (
		["N", "FN", "ADR", "ORG", "TITLE", "NOTE", "X-ANDROID-CUSTOM", "EMAIL", "URL"].includes(
			name,
		)
	)
		for (const t of comps.join(" ").match(/\p{L}+/gu) ?? [])
			if (!isStop(t)) originalKeys.add(fold(t));
	for (const p of it.head.split(";").slice(1))
		if (/^X-/i.test(p)) originalKeys.add(fold(p.slice(2)));
}

const sensitive = new Set();
const noteSensitive = (s) => {
	for (const t of s.match(/\p{L}{3,}|\p{N}{4,}/gu) ?? []) if (!isStop(t)) sensitive.add(fold(t));
};
const photoCache = new Map();
for (const it of items) {
	const name = it.head.split(";")[0];
	if (it.kind === "b64") {
		const hash = crypto.createHash("sha256").update(it.bytes).digest("hex");
		if (!photoCache.has(hash)) photoCache.set(hash, avatar(hash, it.bytes.length));
		it.bytes = photoCache.get(hash);
		continue;
	}
	if (["BEGIN", "END", "VERSION"].includes(name)) continue;
	// Custom parameter labels (TEL;X-Sosh) name carriers or banks: rewrite them too.
	it.head = it.head
		.split(";")
		.map((p, i) => {
			if (i === 0 || !/^X-/i.test(p)) return p;
			noteSensitive(p.slice(2));
			return `X-${asWords(p.slice(2), "param")}`;
		})
		.join(";");
	const comps = compsOf(it);
	for (const c of comps) noteSensitive(c);
	let out;
	switch (name) {
		case "N":
		case "FN":
			out = comps.map((c) => asNames(c, name));
			break;
		case "ADR":
			out = comps.map((c, i) => (i === 6 ? c : asWords(c, "adr")));
			break;
		case "ORG":
		case "TITLE":
		case "NOTE":
			out = comps.map((c) => asWords(c, name));
			break;
		case "TEL":
			out = [fakeTel(it.value)];
			sensitive.add(it.value.replace(/\D/g, "").slice(-8));
			break;
		case "EMAIL":
			out = [fakeEmail(it.value)];
			sensitive.add(it.value.toLowerCase());
			break;
		case "URL":
			out = [fakeUrl(it.value)];
			break;
		case "BDAY":
			out = [fakeDate(it.value)];
			sensitive.add(it.value);
			break;
		case "X-ANDROID-CUSTOM": {
			const mime = comps[0];
			const kind = mime.split("/")[1];
			out = comps.map((c, i) => {
				if (i === 0 || c === "") return c;
				if (kind === "nickname") return i === 1 ? asNames(c, "nick") : c;
				if (kind === "relation")
					return i === 1 ? asNames(c, "rel") : i === 3 ? asWords(c, "rel") : c;
				if (kind === "contact_event")
					return i === 1 ? fakeDate(c) : i === 3 ? asWords(c, "event") : c;
				throw new Error(`unhandled android custom ${mime}`);
			});
			break;
		}
		default:
			throw new Error(`unhandled property ${name}`);
	}
	if (out.length !== comps.length) throw new Error(`component count changed for ${name}`);
	if (it.kind === "qp")
		it.comps.forEach((c, i) => {
			if (!c.literal) c.text = out[i];
		});
	else it.value = out.join(";");
}

const result = serialize(items);
fs.writeFileSync(outPath, result);
console.log(`wrote ${outPath}: ${result.length} bytes (original ${orig.length})`);

const reparsed = parse(result.toString("latin1").slice(0, -2).split("\r\n"));
if (!serialize(reparsed).equals(result)) throw new Error("output does not round-trip");
if (reparsed.length !== items.length) throw new Error("property count changed");
const decoded = fold(
	reparsed
		.map((it) => (it.kind === "b64" ? "" : `${it.head} ${compsOf(it).join(" ")}`))
		.join("\n"),
);
const ALLOW = new Set(
	"vnd android cursor item nickname relation contact event https www com org net fr".split(" "),
);
for (const d of KEEP_DOMAINS) for (const l of d.split(".")) ALLOW.add(l);
const outTokens = new Set(decoded.match(/\p{L}+|\p{N}+/gu) ?? []);
const leaks = [...sensitive].filter(
	(s) => !ALLOW.has(s) && (outTokens.has(s) || (s.includes("@") && decoded.includes(s))),
);
console.log(`leak scan: ${sensitive.size} sensitive tokens checked, ${leaks.length} found`);
if (leaks.length) console.log("LEAKS:", leaks);
console.log(
	`same physical line count: ${result.toString("latin1").split("\r\n").length === text.split("\r\n").length}; photos: ${photoCache.size} distinct`,
);
