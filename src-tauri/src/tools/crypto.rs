use serde::{Deserialize, Serialize};

// ============ Tauri Commands ============

#[derive(Serialize, Deserialize, Clone)]
pub struct AesResult {
    pub success: bool,
    pub result: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JwtPayload {
    pub header: serde_json::Value,
    pub payload: serde_json::Value,
    pub signature: String,
    pub decoded: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PasswordResult {
    pub password: String,
    pub length: usize,
    pub strength: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PasswordStrength {
    pub score: u8,
    pub level: String,
    pub issues: Vec<String>,
    pub suggestions: Vec<String>,
}

#[tauri::command]
pub fn aes_encrypt(input: String, key: String) -> AesResult {
    let key_bytes = key.as_bytes();
    if key_bytes.len() != 32 {
        return AesResult {
            success: false,
            result: String::new(),
            message: format!("Key must be exactly 32 bytes (256 bits) for AES-256. Provided: {} bytes", key_bytes.len()),
        };
    }

    let mut data = input.clone().into_bytes();
    // PKCS#7 padding
    let pad_len = 16 - (data.len() % 16);
    for _ in 0..pad_len {
        data.push(pad_len as u8);
    }

    let cipher = aes_256_ecb_encrypt(&data, key_bytes);
    let hex_str: String = cipher.iter().map(|b| format!("{:02x}", b)).collect();

    AesResult {
        success: true,
        result: hex_str,
        message: format!("Encrypted {} bytes -> {} bytes", input.len(), cipher.len()),
    }
}

#[tauri::command]
pub fn aes_decrypt(input: String, key: String) -> AesResult {
    let key_bytes = key.as_bytes();
    if key_bytes.len() != 32 {
        return AesResult {
            success: false,
            result: String::new(),
            message: format!("Key must be exactly 32 bytes (256 bits) for AES-256. Provided: {} bytes", key_bytes.len()),
        };
    }

    // Parse hex input
    let input_clean: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let mut cipher = Vec::with_capacity(input_clean.len() / 2);
    let chars: Vec<char> = input_clean.chars().collect();
    let mut i = 0;
    while i + 1 < chars.len() {
        let byte_str: String = chars[i..i + 2].iter().collect();
        match u8::from_str_radix(&byte_str, 16) {
            Ok(b) => cipher.push(b),
            Err(_) => {
                return AesResult {
                    success: false,
                    result: String::new(),
                    message: format!("Invalid hex at position {}", i),
                };
            }
        }
        i += 2;
    }

    if cipher.len() % 16 != 0 || cipher.is_empty() {
        return AesResult {
            success: false,
            result: String::new(),
            message: format!("Ciphertext length must be a positive multiple of 16. Got: {}", cipher.len()),
        };
    }

    let plaintext = aes_256_ecb_decrypt(&cipher, key_bytes);

    // PKCS#7 unpadding
    if let Some(&pad_byte) = plaintext.last() {
        let pad_len = pad_byte as usize;
        if pad_len > 0 && pad_len <= 16 && pad_len <= plaintext.len() {
            let valid = plaintext[plaintext.len() - pad_len..]
                .iter()
                .all(|&b| b == pad_len as u8);
            if valid {
                let unpadded = &plaintext[..plaintext.len() - pad_len];
                return AesResult {
                    success: true,
                    result: String::from_utf8_lossy(unpadded).to_string(),
                    message: format!("Decrypted {} bytes", unpadded.len()),
                };
            }
        }
    }

    AesResult {
        success: true,
        result: String::from_utf8_lossy(&plaintext).to_string(),
        message: "Decrypted (no valid padding found, raw output)".into(),
    }
}

#[tauri::command]
pub fn jwt_decode(token: String) -> JwtPayload {
    let parts: Vec<&str> = token.trim().split('.').collect();
    if parts.len() != 3 {
        return JwtPayload {
            header: serde_json::Value::Null,
            payload: serde_json::Value::Null,
            signature: String::new(),
            decoded: false,
        };
    }

    let header = base64url_decode_json(parts[0]).unwrap_or(serde_json::json!({"error": "Invalid header encoding"}));
    let payload = base64url_decode_json(parts[1]).unwrap_or(serde_json::json!({"error": "Invalid payload encoding"}));
    let signature = parts[2].to_string();

    JwtPayload {
        header,
        payload,
        signature,
        decoded: true,
    }
}

#[tauri::command]
pub fn password_generate(
    length: Option<usize>,
    uppercase: Option<bool>,
    lowercase: Option<bool>,
    numbers: Option<bool>,
    symbols: Option<bool>,
) -> PasswordResult {
    let len = length.unwrap_or(16).max(4).min(128);
    let use_upper = uppercase.unwrap_or(true);
    let use_lower = lowercase.unwrap_or(true);
    let use_num = numbers.unwrap_or(true);
    let use_sym = symbols.unwrap_or(true);

    let mut pool = String::new();
    if use_upper {
        pool.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    if use_lower {
        pool.push_str("abcdefghijklmnopqrstuvwxyz");
    }
    if use_num {
        pool.push_str("0123456789");
    }
    if use_sym {
        pool.push_str("!@#$%^&*()_+-=[]{}|;:,.<>?");
    }
    if pool.is_empty() {
        pool.push_str("abcdefghijklmnopqrstuvwxyz");
    }

    let pool_bytes: Vec<u8> = pool.bytes().collect();
    let mut password = String::with_capacity(len);
    let mut rng_buf = [0u8; 4];
    let mut rng_state;

    for _ in 0..len {
        getrandom::getrandom(&mut rng_buf).ok();
        rng_state = u32::from_le_bytes(rng_buf);
        rng_state = rng_state.wrapping_mul(1103515245).wrapping_add(12345);
        let idx = (rng_state as usize) % pool_bytes.len();
        password.push(pool_bytes[idx] as char);
    }

    let strength = password_strength_internal(&password);

    PasswordResult {
        password,
        length: len,
        strength,
    }
}

#[tauri::command]
pub fn password_check(password: String) -> PasswordStrength {
    check_password_strength(&password)
}

// ============ AES-256-ECB Implementation ============

/// AES-256 ECB encryption (educational implementation, ECB mode is insecure for real use)
fn aes_256_ecb_encrypt(plaintext: &[u8], key: &[u8]) -> Vec<u8> {
    let round_keys = aes_256_key_expansion(key);
    let mut result = Vec::with_capacity(plaintext.len());

    for block in plaintext.chunks(16) {
        let mut state = [0u8; 16];
        state.copy_from_slice(block);
        aes_encrypt_block(&mut state, &round_keys);
        result.extend_from_slice(&state);
    }
    result
}

fn aes_256_ecb_decrypt(ciphertext: &[u8], key: &[u8]) -> Vec<u8> {
    let round_keys = aes_256_key_expansion(key);
    let mut result = Vec::with_capacity(ciphertext.len());

    for block in ciphertext.chunks(16) {
        let mut state = [0u8; 16];
        state.copy_from_slice(block);
        aes_decrypt_block(&mut state, &round_keys);
        result.extend_from_slice(&state);
    }
    result
}

const SBOX: [u8; 256] = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

const INV_SBOX: [u8; 256] = [
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
    0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
    0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
    0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
    0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
    0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
    0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
    0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
    0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
    0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
    0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d,
];

const RCON: [u8; 11] = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

fn aes_256_key_expansion(key: &[u8]) -> [[u8; 16]; 15] {
    let nk = 8;
    let nr = 14;
    let total_words = 4 * (nr + 1);
    let mut w = vec![[0u8; 4]; total_words];

    for i in 0..nk {
        w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
    }

    for i in nk..total_words {
        let mut temp = w[i - 1];
        if i % nk == 0 {
            // RotWord
            temp = [temp[1], temp[2], temp[3], temp[0]];
            // SubWord
            for b in temp.iter_mut() {
                *b = SBOX[*b as usize];
            }
            temp[0] ^= RCON[i / nk];
        } else if nk > 6 && i % nk == 4 {
            for b in temp.iter_mut() {
                *b = SBOX[*b as usize];
            }
        }
        for j in 0..4 {
            w[i][j] = w[i - nk][j] ^ temp[j];
        }
    }

    let mut round_keys = [[0u8; 16]; 15];
    for r in 0..15 {
        for c in 0..4 {
            for k in 0..4 {
                round_keys[r][c * 4 + k] = w[r * 4 + c][k];
            }
        }
    }
    round_keys
}

fn add_round_key(state: &mut [u8; 16], round_key: &[u8; 16]) {
    for i in 0..16 {
        state[i] ^= round_key[i];
    }
}

fn sub_bytes(state: &mut [u8; 16]) {
    for b in state.iter_mut() {
        *b = SBOX[*b as usize];
    }
}

fn inv_sub_bytes(state: &mut [u8; 16]) {
    for b in state.iter_mut() {
        *b = INV_SBOX[*b as usize];
    }
}

fn shift_rows(state: &mut [u8; 16]) {
    let temp = *state;
    // Row 0: no shift
    // Row 1: shift left 1
    state[1] = temp[5];
    state[5] = temp[9];
    state[9] = temp[13];
    state[13] = temp[1];
    // Row 2: shift left 2
    state[2] = temp[10];
    state[6] = temp[14];
    state[10] = temp[2];
    state[14] = temp[6];
    // Row 3: shift left 3
    state[3] = temp[15];
    state[7] = temp[3];
    state[11] = temp[7];
    state[15] = temp[11];
}

fn inv_shift_rows(state: &mut [u8; 16]) {
    let temp = *state;
    // Row 0: no shift
    // Row 1: shift right 1
    state[1] = temp[13];
    state[5] = temp[1];
    state[9] = temp[5];
    state[13] = temp[9];
    // Row 2: shift right 2
    state[2] = temp[10];
    state[6] = temp[14];
    state[10] = temp[2];
    state[14] = temp[6];
    // Row 3: shift right 3
    state[3] = temp[7];
    state[7] = temp[11];
    state[11] = temp[15];
    state[15] = temp[3];
}

fn xtime(x: u8) -> u8 {
    if x & 0x80 != 0 {
        (x << 1) ^ 0x1b
    } else {
        x << 1
    }
}

fn gf_mul(a: u8, b: u8) -> u8 {
    let mut result = 0u8;
    let mut a = a;
    let mut b = b;
    for _ in 0..8 {
        if b & 1 != 0 {
            result ^= a;
        }
        let hi = a & 0x80;
        a <<= 1;
        if hi != 0 {
            a ^= 0x1b;
        }
        b >>= 1;
    }
    result
}

fn mix_columns(state: &mut [u8; 16]) {
    for i in 0..4 {
        let col = [
            state[i * 4],
            state[i * 4 + 1],
            state[i * 4 + 2],
            state[i * 4 + 3],
        ];
        state[i * 4] = gf_mul(col[0], 2) ^ gf_mul(col[1], 3) ^ col[2] ^ col[3];
        state[i * 4 + 1] = col[0] ^ gf_mul(col[1], 2) ^ gf_mul(col[2], 3) ^ col[3];
        state[i * 4 + 2] = col[0] ^ col[1] ^ gf_mul(col[2], 2) ^ gf_mul(col[3], 3);
        state[i * 4 + 3] = gf_mul(col[0], 3) ^ col[1] ^ col[2] ^ gf_mul(col[3], 2);
    }
}

fn inv_mix_columns(state: &mut [u8; 16]) {
    for i in 0..4 {
        let col = [
            state[i * 4],
            state[i * 4 + 1],
            state[i * 4 + 2],
            state[i * 4 + 3],
        ];
        state[i * 4] = gf_mul(col[0], 0x0e) ^ gf_mul(col[1], 0x0b) ^ gf_mul(col[2], 0x0d) ^ gf_mul(col[3], 0x09);
        state[i * 4 + 1] = gf_mul(col[0], 0x09) ^ gf_mul(col[1], 0x0e) ^ gf_mul(col[2], 0x0b) ^ gf_mul(col[3], 0x0d);
        state[i * 4 + 2] = gf_mul(col[0], 0x0d) ^ gf_mul(col[1], 0x09) ^ gf_mul(col[2], 0x0e) ^ gf_mul(col[3], 0x0b);
        state[i * 4 + 3] = gf_mul(col[0], 0x0b) ^ gf_mul(col[1], 0x0d) ^ gf_mul(col[2], 0x09) ^ gf_mul(col[3], 0x0e);
    }
}

fn aes_encrypt_block(state: &mut [u8; 16], round_keys: &[[u8; 16]; 15]) {
    add_round_key(state, &round_keys[0]);
    for round in 1..14 {
        sub_bytes(state);
        shift_rows(state);
        mix_columns(state);
        add_round_key(state, &round_keys[round]);
    }
    sub_bytes(state);
    shift_rows(state);
    add_round_key(state, &round_keys[14]);
}

fn aes_decrypt_block(state: &mut [u8; 16], round_keys: &[[u8; 16]; 15]) {
    add_round_key(state, &round_keys[14]);
    inv_shift_rows(state);
    inv_sub_bytes(state);
    for round in (1..14).rev() {
        add_round_key(state, &round_keys[round]);
        inv_mix_columns(state);
        inv_shift_rows(state);
        inv_sub_bytes(state);
    }
    add_round_key(state, &round_keys[0]);
}

// ============ JWT Helpers ============

fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    let mut s = input.replace('-', "+").replace('_', "/");
    match s.len() % 4 {
        2 => s.push_str("=="),
        3 => s.push('='),
        _ => {}
    }
    base64_decode_standard(&s)
}

fn base64_decode_standard(input: &str) -> Option<Vec<u8>> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let data: Vec<u8> = input.bytes().filter(|&b| b != b'\n' && b != b'\r' && b != b' ').collect();
    let mut result = Vec::new();

    for chunk in data.chunks(4) {
        let mut vals = [0u32; 4];
        let mut pad = 0;
        for (i, &b) in chunk.iter().enumerate() {
            vals[i] = if b == b'=' {
                pad += 1;
                0
            } else {
                CHARS.iter().position(|&c| c == b).map(|p| p as u32).unwrap_or(0)
            };
        }
        let n = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];
        result.push((n >> 16) as u8);
        if pad < 2 {
            result.push((n >> 8) as u8);
        }
        if pad < 1 {
            result.push(n as u8);
        }
    }
    Some(result)
}

fn base64url_decode_json(input: &str) -> Option<serde_json::Value> {
    let bytes = base64url_decode(input)?;
    let s = String::from_utf8_lossy(&bytes);
    serde_json::from_str(&s).ok()
}

// ============ Password Strength ============

fn check_password_strength(password: &str) -> PasswordStrength {
    let len = password.len();
    let has_lower = password.chars().any(|c| c.is_lowercase());
    let has_upper = password.chars().any(|c| c.is_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_symbol = password.chars().any(|c| !c.is_alphanumeric());
    let unique: std::collections::HashSet<char> = password.chars().collect();

    let mut score: u8 = 0;
    let mut issues = Vec::new();
    let mut suggestions = Vec::new();

    // Length scoring
    if len >= 16 {
        score += 4;
    } else if len >= 12 {
        score += 3;
    } else if len >= 8 {
        score += 2;
    } else if len >= 4 {
        score += 1;
    } else {
        issues.push("Password is too short".into());
    }

    if len < 8 {
        suggestions.push("Use at least 8 characters".into());
    }
    if len < 12 {
        suggestions.push("Consider using 12+ characters for stronger security".into());
    }

    // Character variety
    let variety: u8 = [has_lower, has_upper, has_digit, has_symbol].iter().filter(|&&b| b).count() as u8;
    score += variety;

    if !has_lower {
        issues.push("No lowercase letters".into());
        suggestions.push("Add lowercase letters".into());
    }
    if !has_upper {
        issues.push("No uppercase letters".into());
        suggestions.push("Add uppercase letters".into());
    }
    if !has_digit {
        issues.push("No digits".into());
        suggestions.push("Add numbers".into());
    }
    if !has_symbol {
        issues.push("No special characters".into());
        suggestions.push("Add special characters (!@#$...)".into());
    }

    // Entropy bonus
    if unique.len() >= len * 8 / 10 {
        score += 1;
    }

    // Common patterns
    let common = ["password", "123456", "qwerty", "abc", "admin", "letmein", "welcome"];
    let lower = password.to_lowercase();
    for c in common.iter() {
        if lower.contains(c) {
            score = score.saturating_sub(2);
            issues.push(format!("Contains common word: '{}'", c));
            break;
        }
    }

    let level = match score {
        0..=2 => "Very Weak".to_string(),
        3..=4 => "Weak".to_string(),
        5..=6 => "Fair".to_string(),
        7..=8 => "Strong".to_string(),
        _ => "Very Strong".to_string(),
    };

    if suggestions.is_empty() {
        suggestions.push("Great password!".into());
    }

    PasswordStrength {
        score,
        level,
        issues,
        suggestions,
    }
}

fn password_strength_internal(password: &str) -> String {
    check_password_strength(password).level
}
