/**
 * 
 * 2key-ratchet
 * Copyright (c) 2016 Peculiar Ventures, Inc
 * Based on https://whispersystems.org/docs/specifications/doubleratchet/ and 
 * https://whispersystems.org/docs/specifications/x3dh/ by Open Whisper Systems
 * 
 */

import { INFO_MESSAGE_KEYS } from "./const";
import { ECKeyPair, ECPublicKey, Secret } from "./crypto";
import { HMACCryptoKey, RatchetKey, SymmetricKDFResult } from "./type";
import { Convert } from "./utils";

// Constants for KDF_CK function
const CIPHER_KEY_KDF_INPUT = new Uint8Array([1]).buffer;
const ROOT_KEY_KDF_INPUT = new Uint8Array([2]).buffer;

/**
 * Encrypt/Decrypt result for Symmetric ratchets
 * 
 * @export
 * @interface CipherMessage
 */
export interface CipherMessage {
    /**
     * Encrypted or decrypted message
     */
    cipherText: ArrayBuffer;
    /**
     * HMAC key for SignedMessage calculations
     */
    hmacKey: CryptoKey;
}

export abstract class SymmetricRatchet {

    public counter = 0;

    /**
     * Current symmetric ratchet key
     */
    public rootKey: HMACCryptoKey;

    constructor(rootKey: CryptoKey) {
        this.rootKey = rootKey;
    }

    /**
     * calculates new keys by rootKey KDF_CK(ck)
     * https://whispersystems.org/docs/specifications/doubleratchet/#external-functions
     * 
     * @protected
     * @param {CryptoKey} rootKey
     * @returns
     * 
     * @memberOf SymmetricRatchet
     */
    protected async calculateKey(rootKey: CryptoKey) {
        const cipherKeyBytes = await Secret.sign(rootKey, CIPHER_KEY_KDF_INPUT);
        const nextRootKeyBytes = await Secret.sign(rootKey, ROOT_KEY_KDF_INPUT);

        const res: SymmetricKDFResult = {
            rootKey: await Secret.importHMAC(nextRootKeyBytes),
            cipher: cipherKeyBytes,
        };
        return res;
    }

    /**
     * Move to next step of ratchet
     * 
     * @protected
     * @returns
     * 
     * @memberOf SymmetricRatchet
     */
    protected async click() {
        const rootKey = this.rootKey;
        const res = await this.calculateKey(rootKey);
        this.rootKey = res.rootKey;
        this.counter++;
        return res.cipher;
    }

}

/**
 * Implementation of Sending chain
 * 
 * @export
 * @class SendingRatchet
 * @extends {SymmetricRatchet}
 */
export class SendingRatchet extends SymmetricRatchet {

    /**
     * Encrypts message
     * 
     * @param {ArrayBuffer} message
     * @returns CipherMessage type
     * 
     * @memberOf SendingRatchet
     */
    public async encrypt(message: ArrayBuffer) {
        const cipherKey = await this.click();
        // calculate keys
        const keys = await Secret.HKDF(cipherKey, 3, void 0, INFO_MESSAGE_KEYS);
        const aesKey = await Secret.importAES(keys[0]);
        const hmacKey = await Secret.importHMAC(keys[1]);
        const iv = keys[2].slice(0, 16);

        const cipherText = await Secret.encrypt(aesKey, message, iv);

        return {
            hmacKey,
            cipherText,
        } as CipherMessage;
    }

}

export class ReceivingRatchet extends SymmetricRatchet {

    protected keys: ArrayBuffer[] = [];

    public async decrypt(message: ArrayBuffer, counter: number) {
        const cipherKey = await this.getKey(counter);
        // calculate keys
        const keys = await Secret.HKDF(cipherKey, 3, void 0, INFO_MESSAGE_KEYS);
        const aesKey = await Secret.importAES(keys[0]);
        const hmacKey = await Secret.importHMAC(keys[1]);
        const iv = keys[2].slice(0, 16);

        const cipherText = await Secret.decrypt(aesKey, message, iv);

        return {
            hmacKey,
            cipherText,
        } as CipherMessage;
    }

    protected async getKey(counter: number) {
        while (this.counter <= counter) {
            const cipherKey = await this.click();
            this.keys.push(cipherKey);
        }
        const key = this.keys[counter];
        return key;
    }
}
