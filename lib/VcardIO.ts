/**
 * @module VcardIO
 * Contains classes used to make the interface between the vCard format and its javascript representation.
 */

import * as stringutils from "./stringutils.js";

/**
 * Represent a vCard property as stated by the RFC 6350.
 * A PropertyIO is composed of:
 *  - a mandatory name (see https://datatracker.ietf.org/doc/html/rfc6350#section-6)
 *  - optional parameters (see https://datatracker.ietf.org/doc/html/rfc6350#section-5)
 *  - one or more values
 *
 * No checks are done here to verify that names, parameters or values are following any standards.
 *
 * @see {@link VCardIO}
 */
export class PropertyIO
{
	/**
	 * The property name (i.e. "FN", "NICKNAME", ...).
	 * As stated by the standards, the property name can be lowercase or uppercase. This class always write the names in uppercase in the serializing method
	 * {@link toString}.
	 */
	name = "";
	/**
	 * The list of parameters.
	 * As stated by the standards, the parameters name can be lowercase or uppercase. This class always write the parameters in uppercase in the serializing method
	 * {@link toString}.
	 *
	 * @see {@link addParam}, {@link delParam}, {@link hasParam}, {@link getParam}
	 */
	params = new stringutils.ICaseMap<string>();
	/**
	 * The list of values.
	 *
	 * @see {@link addValue}, {@link delValueAt}, {@link delValue}, {@link hasValue}, {@link getValue}
	 */
	values: string[] = [];

	/**
	 * Constructor
	 * @param name the name of the property
	 */
	constructor(name: string)
	{
		if (name)
			this.name = name;
	}

	/**
	 * Serialize the PropertyIO as a string following the RFC 6350.
	 * @see https://datatracker.ietf.org/doc/html/rfc6350
	 * @param property the PropertyIO to serialize
	 * @returns a serialized version of the PropertyIO.
	 * @throws Error if the PropertyIO is not valid
	 * @note The name and the parameter names are all written in uppercase.
	 * @see {@link PropertyIO.fromString}, {@link PropertyIO.toString}, {@link fromString}, {@link toString}
	 */
	static toString(property: PropertyIO): string { return property.toString(); }
	/**
	 * Reads a property from a vCard formatted string.
	 * @param str the string to read
	 * @returns the deserialized PropertyIO
	 * @throws Error the string is not a valid representation of a field
	 * @note Lowercase names and parameters are supported, but the exported version done by {@link PropertyIO.toString} write them in uppercase.
	 * Thus, you may have a different output when using these 2 functions.
	 * @see {@link PropertyIO.fromString}, {@link PropertyIO.toString}, {@link fromString}, {@link toString}
	 */
	static fromString(str: string): PropertyIO
	{
		const property = new PropertyIO("");
		property.fromString(str);
		return property;
	}

	// params
	/**
	 * Add a parame named by the given key
	 * @param key the name of the param
	 * @param param the value of the param
	 * @note keys are stored in a case-insensitive way
	 * @note if a param with the same key already exists, its value will be updated
	 * @see {@link params}
	 */
	addParam(key: string, param: string) { this.params.set(key, param); }
	/**
	 * Remove the param with the given key
	 * @param key the name of the param to remove
	 * @returns the removed param if any
	 * @see {@link params}
	 */
	delParam(key: string) { return this.params.delete(key); }
	/**
	 * Tell if a param with a name equal to key (in a case-insensitive way) already exists
	 * @param key the name of the param
	 * @returns true if such a param exists
	 * @see {@link params}
	 */
	hasParam(key: string) { return this.params.has(key); }
	/**
	 * Return the param with the given key (in a case-insensitive way) if any
	 * @param key the name of the param
	 * @returns the param if any
	 * @see {@link params}
	 */
	getParam(key: string) { return this.params.get(key); }

	// values
	/**
	 * Append a value.
	 * @param value the value to add
	 * @see {@link values}
	 */
	addValue(value: string) { this.values.push(value) }
	/**
	 * Remove the value at the given index
	 * @param idx the index of the value to remove
	 * @returns true if the value has been removed
	 * @see {@link values}
	 */
	delValueAt(idx: number) { return this.values.splice(idx, 1).length === 1; }
	/**
	 * Remove the first occurrence of the given value, if any
	 * @param value the value to remove
	 * @returns true if a value has been removed
	 * @see {@link values}
	 */
	delValue(value: string)
	{
		for (let i = 0; i < this.values.length; i++)
		{
			if (this.values[i] === value)
			{
				this.values.splice(i, 1);
				return true
			}
		}
		return false;
	}
	/**
	 * Tell if such a value already exists
	 * @param value the value to check
	 * @returns true if it exists
	 * @see {@link values}
	 * @note this is similar to Array.prototype.includes
	 */
	hasValue(value: string) { return this.values.includes(value); }
	/**
	 * Return the value at the given index
	 * @param idx the index of the value, by default 0
	 * @returns the value
	 * @see {@link values}
	 */
	getValue(idx = 0) { return this.values[idx]; }

	// io
	/**
	 * Serialize the PropertyIO as a string following the RFC 6350.
	 * @see https://datatracker.ietf.org/doc/html/rfc6350
	 * @returns a serialized version of the PropertyIO.
	 * @throws Error if the PropertyIO is not valid
	 * @note The name and the parameter names are all written in uppercase.
	 * @see {@link PropertyIO.fromString}, {@link PropertyIO.toString}, {@link fromString}, {@link toString}
	 */
	toString(): string
	{
		if (!this.name)
			throw new Error("Invalid property: missing name");
		if (this.values.length === 0)
			throw new Error("Invalid property: no values added");

		let result = this.name.toUpperCase();

		for (const [key, param] of this.params)
		{
			if (!key || !param)
				throw new Error("Invalid property: empty parameter key");
			result += `;${key.toUpperCase()}=${stringutils.escape(param)}`;
		}
		result += ":" + this.values.map((v) => stringutils.escape(v)).join(";");

		return result;
	}
	/**
	 * Reads a PropertyIO from a vCard formatted string.
	 * @param str the string to read
	 * @throws Error the string is not a valid representation of a field
	 * @note Lowercase names and parameters are supported, but the exported version done by {@link toString} write them in uppercase.
	 * Thus, you may have a different output when using these 2 functions.
	 * @see {@link PropertyIO.fromString}, {@link PropertyIO.toString}, {@link fromString}, {@link toString}
	 */
	fromString(str: string)
	{
		// split in parameters / values, then split parameters and values
		const colonidx = str.indexOf(":");
		if (colonidx < 0 || colonidx === (str.length - 1))
			throw new Error("Invalid property: missing ':' delimiter for values, or no values");

		const parameters = stringutils.split(str.slice(0, colonidx), ";");
		const values = stringutils.split(str.slice(colonidx + 1), ";");

		this.name = parameters.shift()!.toUpperCase();
		if (!this.name)
			throw new Error("Invalid property: no name");
		for (const p of parameters)
		{
			const param = stringutils.split(p, "=");
			if (param.length !== 2)
				throw new Error("Invalid property: invalid parameter");
			this.addParam(param[0].toUpperCase(), stringutils.unescape(param[1]));
		}
		this.values = values.map((v) => stringutils.unescape(v));
	}
}

/**
 * Represent a vCard, for serializing / deserializing.
 * A VCardIO is composed of:
 *  - a mandatory version number (see https://datatracker.ietf.org/doc/html/rfc6350#section-6.7.9)
 *  - optional properties (see https://datatracker.ietf.org/doc/html/rfc6350#section-6)
 *
 * Properties are represented stored in the {@link properties} attribute.
 * @note the properties *BEGIN* and *END* are not stored in {@link properties}, and neither is *VERSION* that is stored in {@link version}
 *
 * No checks are done here to verify that the properties are following any standards.
 *
 * @see {@link PropertyIO}
 */
export class VCardIO
{
	/**
	 * The list of properties that the vCard holds.
	 * The properties are stored in a case-insensitive way. As some properties can appear multiple times, they are all stored as array of properties.
	 * @see https://datatracker.ietf.org/doc/html/rfc6350#section-6
	 * @see {@link addProperty}, {@link delProperties}, {@link delPropertyAt}, {@link hasProperty}, {@link getProperties}, {@link getProperty}, {@link setProperties}
	 */
	properties = new stringutils.ICaseMap<PropertyIO[]>();
	/** The version of the vCard */
	version = "3.0";

	/**
	 * Constructor of a VCardIO
	 * @param version the version of the vCard
	 */
	constructor(version: string)
	{
		if (version)
			this.version = version;
	}

	/**
	 * Serialize the VCardIO as a string following the RFC 6350.
	 * @see https://datatracker.ietf.org/doc/html/rfc6350
	 * @param vcard the vcard to serialize
	 * @returns a serialized version of the vCard.
	 * @throws Error if the VCardIO is not valid
	 * @note The name and the parameter names are all written in uppercase.
	 * @note the string is folded at 75 characters long, following the RFC 6350 standards (https://datatracker.ietf.org/doc/html/rfc6350#section-3.2)
	 * @see {@link VCardIO.fromString}, {@link VCardIO.toString}, {@link fromString}, {@link toString}
	 */
	static toString(vcard: VCardIO): string { return vcard.toString(); }
	/**
	 * Read a vCard and deserialize it.
	 * @param str the serialized vCard
	 * @returns a VCardIO containing the info of its string representation.
	 * @throws Error if string is not a valid representation of a vCard
	 * @note the properties *BEGIN* and *END* are not stored in {@link properties}, and neither is *VERSION* that is stored in {@link version}
	 * @see {@link VCardIO.fromString}, {@link VCardIO.toString}, {@link fromString}, {@link toString}
	 */
	static fromString(str: string): VCardIO
	{
		const vcard = new VCardIO("");
		vcard.fromString(str);
		return vcard;
	}

	// params
	/**
	 * Append a property.
	 * The property is appended to `properties[property.name]` where `property.name` key is checked in a case-insensitive way.
	 * @param property the property to add
	 * @see {@link properties}
	 */
	addProperty(property: PropertyIO)
	{
		if (this.hasProperty(property.name))
			this.getProperties(property.name)!.push(property);
		else
			this.properties.set(property.name, [property]);
	}
	/**
	 * Remove all the properties having the given name (checked in a case-insensitive way)
	 * @param name the name of the properties to remove
	 * @returns true if some properties have been removed
	 * @see {@link properties}
	 */
	delProperties(name: string) { return this.properties.delete(name); }
	/**
	 * Remove the property with the given name (checked in a case-insensitive way) and the given index
	 * @param name the name of the property
	 * @param idx the index of the property
	 * @returns the removed proeprty if any
	 * @see {@link properties}
	 */
	delPropertyAt(name: string, idx: number)
	{
		if ((this.getProperties(name)?.length ?? 0) <= idx)
			return undefined;
		const result = this.properties.get(name)?.splice(idx, 1)?.[0];
		if (this.getProperties(name)?.length === 0)
			this.delProperties(name);
		return result;
	}
	/**
	 * Tell if a property with the given name (in a case-insensitive way) already exists
	 * @param name the name of the property to search
	 * @returns true if such a property exists
	 * @see {@link properties}
	 */
	hasProperty(name: string) { return this.properties.has(name); }
	/**
	 * Return the properties with the given name (in a case-insensitive way) if any
	 * @param name the name of the properties
	 * @returns the properties if it exists, as an array
	 * @see {@link properties}
	 */
	getProperties(name: string) { return this.properties.get(name); }
	/**
	 * Return the property with the given name (in a case-insensitive way) and at the given position, if any
	 * @param name the name of the property
	 * @param idx the index of the property (0 by default)
	 * @returns the property if it exists
	 * @see {@link properties}
	 */
	getProperty(name: string, idx = 0)
	{
		if ((this.getProperties(name)?.length ?? 0) <= idx)
			return undefined;
		return this.properties.get(name)?.[idx];
	}
	/**
	 * Set the properties with the given name.
	 * If any properties already existed with the same name, they will be replaced.
	 * @param name the name of the properties
	 * @param properties the array of properties to set
	 * @see {@link properties}
	 */
	setProperties(name: string, properties: PropertyIO[]) { this.properties.set(name, properties); }

	// io
	/**
	 * Serialize the VCardIO as a string following the RFC 6350.
	 * @see https://datatracker.ietf.org/doc/html/rfc6350
	 * @returns a serialized version of the VCardIO.
	 * @throws Error if the VCardIO is not valid
	 * @note The name and the parameter names are all written in uppercase.
	 * @note the string is folded at 75 characters long, following the RFC 6350 standards (https://datatracker.ietf.org/doc/html/rfc6350#section-3.2)
	 * @see {@link VCardIO.fromString}, {@link VCardIO.toString}, {@link fromString}, {@link toString}
	 */
	toString(): string
	{
		if (!this.version)
			throw new Error("Invalid vCard: no version");
		const vcard = ["BEGIN:VCARD", "VERSION:" + this.version];
		for (const properties of this.properties.values())
		{
			for (const p of properties)
				vcard.push(stringutils.fold(p.toString()));
		}
		vcard.push("END:VCARD");

		return vcard.join("\r\n") + "\r\n";
	}
	/**
	 * Read a vCard and loads its content.
	 * @param str the serialized vCard
	 * @throws Error if string is not a valid representation of a vCard
	 * @note the properties *BEGIN* and *END* are not stored in {@link properties}, and neither is *VERSION* that is stored in {@link version}
	 * @see {@link VCardIO.fromString}, {@link VCardIO.toString}, {@link fromString}, {@link toString}
	 */
	fromString(str: string)
	{
		const vcard = stringutils.unfold(str).split("\r\n").filter((f) => f.length !== 0 && !/^\s+$/.test(f));
		if (vcard.length < 3 || vcard.shift()?.toUpperCase() !== "BEGIN:VCARD" || vcard.pop()?.toUpperCase() !== "END:VCARD")
			throw new Error("Invalid vCard: missing keywords");

		// version
		const versionProperty = PropertyIO.fromString(vcard.shift()!);
		if (versionProperty.name !== "VERSION" || versionProperty.params.size !== 0 || versionProperty.values.length !== 1)
			throw new Error("Invalid vCard: missing version");
		this.version = versionProperty.getValue();

		// vCard content
		for (const f of vcard)
			this.addProperty(PropertyIO.fromString(f));

		return true;
	}
}
