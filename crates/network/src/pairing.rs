use rand::Rng;

const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // Removed O, 0, I, 1, L

pub struct Pairing;

impl Pairing {
    pub fn generate_code() -> String {
        let mut rng = rand::thread_rng();
        let mut code = String::with_capacity(4);
        for _ in 0..4 {
            let idx = rng.gen_range(0..ALPHABET.len());
            code.push(ALPHABET[idx] as char);
        }
        code
    }
    
    pub fn normalize_code(input: &str) -> String {
        input.to_uppercase()
             .chars()
             .filter(|c| ALPHABET.contains(&(*c as u8)))
             .collect()
    }
}
