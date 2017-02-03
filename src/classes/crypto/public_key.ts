/**
 * 
 * 2key-ratchet
 * Copyright (c) 2016 Peculiar Ventures, Inc
 * Based on https://whispersystems.org/docs/specifications/doubleratchet/ and 
 * https://whispersystems.org/docs/specifications/x3dh/ by Open Whisper Systems
 * 
 */

import { ECKeyType } from "../type";
import { Convert, isEqual } from "../utils";
import crypto from "./crypto";
import { Curve } from "./curve";
import { Secret } from "./secret";

/**
 * Implementation of EC public key
 * 
 * @export
 * @class ECPublicKey
 */
export class ECPublicKey {

    /**
     * Creates new instance of ECPublicKey from CryptoKey
     * 
     * @static
     * @param {CryptoKey} publicKey
     * @returns
     * 
     * @memberOf ECPublicKey
     */
    public static async create(publicKey: CryptoKey) {
        const res = new this();
        const algName = publicKey.algorithm.name.toUpperCase();
        if (!(algName === "ECDH" || algName === "ECDSA")) {
            throw new Error("Error: Unsupported asymmetric key algorithm.");
        }
        if (publicKey.type !== "public") {
            throw new Error("Error: Expected key type to be public but it was not.");
        }
        res.key = publicKey;

        // Serialize public key to JWK
        const jwk = await crypto.subtle.exportKey("jwk", publicKey);
        const x = Convert.FromBase64Url(jwk.x);
        const y = Convert.FromBase64Url(jwk.y);
        const xy = Convert.ToBinary(x) + Convert.ToBinary(y);
        res.serialized = Convert.FromBinary(xy);
        res.id = await res.thumbprint();

        return res;
    }

    /**
     * Creates ECPublicKey from raw data
     * 
     * @static
     * @param {ArrayBuffer} bytes
     * @param {ECKeyType} type type of EC key. ECDSA | ECDH
     * @returns
     * 
     * @memberOf ECPublicKey
     */
    public static async importKey(bytes: ArrayBuffer, type: ECKeyType) {
        const x = Convert.ToBase64Url(bytes.slice(0, 32));
        const y = Convert.ToBase64Url(bytes.slice(32));
        const jwk = {
            kty: "EC",
            crv: Curve.NAMED_CURVE,
            x,
            y,
        };
        const usage = (type === "ECDSA" ? ["verify"] : ["deriveBits"]);
        const key = await crypto.subtle
            .importKey("jwk", jwk, { name: type, namedCurve: Curve.NAMED_CURVE }, true, usage);
        const res = await ECPublicKey.create(key);
        return res;
    }

    /**
     * Identity of ECPublicKey
     * HEX string of thumbprint of EC key
     * 
     * @type {string}
     * @memberOf ECPublicKey
     */
    public id: string;

    /**
     * Crypto key
     * 
     * @type {CryptoKey}
     * @memberOf ECPublicKey
     */
    public key: CryptoKey;

    /**
     * raw data of key
     * 
     * @protected
     * @type {ArrayBuffer}
     * @memberOf ECPublicKey
     */
    protected serialized: ArrayBuffer;

    /**
     * Returns key in raw format
     * 
     * @returns
     * 
     * @memberOf ECPublicKey
     */
    public serialize() {
        return this.serialized;
    }

    /**
     * Returns SHA-1 digest of key
     * 
     * @returns
     * 
     * @memberOf ECPublicKey
     */
    public async thumbprint() {
        const bytes = await this.serialize();
        const thumbprint = await Secret.digest("SHA-1", bytes);
        return Convert.ToHex(thumbprint);
    }

    /**
     * Returns `true` if current is equal to given parameter 
     * 
     * @param {*} other
     * @returns
     * 
     * @memberOf ECPublicKey
     */
    public async isEqual(other: any) {
        if (!(other && other instanceof ECPublicKey)) { return false; }

        return isEqual(this.serialized, other.serialized);
    }

}