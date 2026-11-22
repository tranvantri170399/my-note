/**
 * Module mã hóa đầu cuối (End-to-End Encryption) sử dụng Web Crypto API chuẩn trình duyệt.
 * - Thuật toán dẫn xuất khóa: PBKDF2-HMAC-SHA256 (310,000 vòng lặp)
 * - Thuật toán mã hóa: AES-256-GCM (kèm xác thực toàn vẹn dữ liệu)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MyNoteCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KDF_ITERATIONS = 310000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const VAULT_MARKER = 'my-note-vault';

  function getCrypto() {
    const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoObj || !cryptoObj.subtle) {
      throw new Error(
        'Trình duyệt chưa bật Web Crypto API (crypto.subtle). Hãy mở qua HTTPS, http://localhost hoặc trình duyệt hiện đại.'
      );
    }
    return cryptoObj;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function deriveKey(masterPassword, saltBytes, iterations = KDF_ITERATIONS) {
    const cryptoObj = getCrypto();
    const encoder = new TextEncoder();
    const keyMaterial = await cryptoObj.subtle.importKey(
      'raw',
      encoder.encode(masterPassword),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return cryptoObj.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Mã hóa object dữ liệu thành JSON envelope an toàn để lưu lên Gist (data.json)
   */
  async function encryptVaultData(plainData, masterPassword) {
    if (!masterPassword) {
      throw new Error('Vui lòng nhập Master Password.');
    }

    const cryptoObj = getCrypto();
    const salt = cryptoObj.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = cryptoObj.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(masterPassword, salt, KDF_ITERATIONS);

    const encoder = new TextEncoder();
    const encodedPayload = encoder.encode(JSON.stringify(plainData));

    const encryptedBuffer = await cryptoObj.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedPayload
    );

    return {
      app: VAULT_MARKER,
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: KDF_ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Giải mã nội dung file data.json từ Gist bằng Master Password
   */
  async function decryptVaultData(envelope, masterPassword) {
    if (!masterPassword) {
      throw new Error('Vui lòng nhập Master Password.');
    }

    if (!envelope || typeof envelope !== 'object') {
      throw new Error('Dữ liệu data.json không hợp lệ.');
    }

    if (!envelope.salt || !envelope.iv || !envelope.ciphertext) {
      const err = new Error('File data.json không đúng định dạng mã hóa của My Note Vault.');
      err.code = 'INVALID_FORMAT';
      throw err;
    }

    const cryptoObj = getCrypto();
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const iterations = Number(envelope.iterations) || KDF_ITERATIONS;

    const key = await deriveKey(masterPassword, salt, iterations);

    try {
      const decryptedBuffer = await cryptoObj.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedBuffer));
    } catch {
      const err = new Error('Sai Master Password hoặc dữ liệu đã bị thay đổi.');
      err.code = 'WRONG_PASSWORD';
      throw err;
    }
  }

  /**
   * Tạo mật khẩu ngẫu nhiên an toàn bằng CSPRNG của trình duyệt
   */
  function generateStrongPassword(
    length = 18,
    options = { upper: true, lower: true, numbers: true, symbols: true }
  ) {
    const cryptoObj = getCrypto();
    const targetLength = Math.max(4, Number(length) || 18);
    let charset = '';
    const pools = [];

    if (options.lower !== false) {
      const lower = 'abcdefghijkmnopqrstuvwxyz';
      charset += lower;
      pools.push(lower);
    }
    if (options.upper !== false) {
      const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      charset += upper;
      pools.push(upper);
    }
    if (options.numbers !== false) {
      const nums = '23456789';
      charset += nums;
      pools.push(nums);
    }
    if (options.symbols !== false) {
      const syms = '!@#$%^&*-_=+?';
      charset += syms;
      pools.push(syms);
    }
    if (!charset) {
      charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      pools.push(charset);
    }

    const randomValues = cryptoObj.getRandomValues(new Uint32Array(targetLength));
    const chars = [];

    for (let i = 0; i < pools.length && i < targetLength; i++) {
      const pool = pools[i];
      chars.push(pool[randomValues[i] % pool.length]);
    }

    for (let i = chars.length; i < targetLength; i++) {
      chars.push(charset[randomValues[i] % charset.length]);
    }

    const shuffleValues = cryptoObj.getRandomValues(new Uint32Array(chars.length));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = shuffleValues[i] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }

  return {
    VAULT_MARKER,
    encryptVaultData,
    decryptVaultData,
    generateStrongPassword,
  };
});
