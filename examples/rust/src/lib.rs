#[export_name = "d"]
pub static DESCRIPTION: &str = "rust example";

#[export_name = "p"]
pub extern "C" fn process() -> f32 {
    0.0
}
