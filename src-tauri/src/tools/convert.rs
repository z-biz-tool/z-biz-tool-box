use serde::{Deserialize, Serialize};

// ============ Tauri Commands ============

#[derive(Serialize, Deserialize, Clone)]
pub struct ColorInfo {
    pub hex: String,
    pub rgb: String,
    pub hsl: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub h: f64,
    pub s: f64,
    pub l: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BaseConversion {
    pub binary: String,
    pub octal: String,
    pub decimal: String,
    pub hexadecimal: String,
    pub input: String,
    pub base_from: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UnitConversion {
    pub input_value: f64,
    pub input_unit: String,
    pub output_value: f64,
    pub output_unit: String,
    pub category: String,
    pub formula: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ExchangeResult {
    pub from_currency: String,
    pub to_currency: String,
    pub amount: f64,
    pub rate: f64,
    pub result: f64,
    pub note: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CronResult {
    pub expression: String,
    pub description: String,
    pub valid: bool,
    pub message: String,
    pub next_runs: Vec<String>,
}

#[tauri::command]
pub fn color_convert(input: String, format: Option<String>) -> ColorInfo {
    let input = input.trim();
    let (r, g, b) = if input.starts_with('#') {
        parse_hex_color(input)
    } else if input.to_lowercase().starts_with("rgb") {
        parse_rgb_color(input)
    } else if input.to_lowercase().starts_with("hsl") {
        parse_hsl_color(input)
    } else {
        (0, 0, 0)
    };

    let (h, s, l) = rgb_to_hsl(r, g, b);

    ColorInfo {
        hex: format!("#{:02X}{:02X}{:02X}", r, g, b),
        rgb: format!("rgb({}, {}, {})", r, g, b),
        hsl: format!("hsl({:.0}, {:.0}%, {:.0}%)", h, s * 100.0, l * 100.0),
        r,
        g,
        b,
        h,
        s,
        l,
    }
}

#[tauri::command]
pub fn base_convert(input: String, from_base: Option<u32>) -> BaseConversion {
    let base = from_base.unwrap_or(10);
    let input_clean = input.trim();

    let decimal_val: i128 = match i128::from_str_radix(input_clean, base) {
        Ok(v) => v,
        Err(_) => {
            return BaseConversion {
                input: input.clone(),
                base_from: base,
                binary: "Invalid input".into(),
                octal: String::new(),
                decimal: String::new(),
                hexadecimal: String::new(),
            };
        }
    };

    BaseConversion {
        binary: format!("{:b}", decimal_val),
        octal: format!("{:o}", decimal_val),
        decimal: format!("{}", decimal_val),
        hexadecimal: format!("{:X}", decimal_val),
        input: input.clone(),
        base_from: base,
    }
}

#[tauri::command]
pub fn unit_convert(
    value: f64,
    from_unit: String,
    to_unit: String,
    category: String,
) -> UnitConversion {
    let result = convert_unit(value, &from_unit, &to_unit, &category);

    UnitConversion {
        input_value: value,
        input_unit: from_unit.clone(),
        output_value: result,
        output_unit: to_unit.clone(),
        category,
        formula: format!("{} {} = {} {}", value, from_unit, result, to_unit),
    }
}

#[tauri::command]
pub fn exchange_convert(amount: f64, from_currency: String, to_currency: String) -> ExchangeResult {
    let rates = get_exchange_rates();
    let from_upper = from_currency.to_uppercase();
    let to_upper = to_currency.to_uppercase();

    let from_rate = rates.iter().find(|(c, _)| *c == from_upper).map(|(_, r)| *r);
    let to_rate = rates.iter().find(|(c, _)| *c == to_upper).map(|(_, r)| *r);

    match (from_rate, to_rate) {
        (Some(fr), Some(tr)) => {
            let usd_amount = amount / fr;
            let result = usd_amount * tr;
            let rate = tr / fr;
            ExchangeResult {
                from_currency: from_upper.clone(),
                to_currency: to_upper.clone(),
                amount,
                rate,
                result,
                note: "Static exchange rates (approximate, for reference only)".into(),
            }
        }
        _ => ExchangeResult {
            from_currency: from_upper.clone(),
            to_currency: to_upper.clone(),
            amount,
            rate: 0.0,
            result: 0.0,
            note: format!("Unsupported currency pair: {} -> {}", from_upper, to_upper),
        },
    }
}

#[tauri::command]
pub fn cron_parse(expression: String) -> CronResult {
    parse_cron_expression(&expression)
}

// ============ Color Helpers ============

fn parse_hex_color(input: &str) -> (u8, u8, u8) {
    let hex = input.trim_start_matches('#');
    let (r, g, b) = if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
        (r, g, b)
    } else if hex.len() == 3 {
        let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).unwrap_or(0);
        let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).unwrap_or(0);
        let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).unwrap_or(0);
        (r, g, b)
    } else {
        (0, 0, 0)
    };
    (r, g, b)
}

fn parse_rgb_color(input: &str) -> (u8, u8, u8) {
    let inner = input
        .trim_start_matches(|c: char| c.is_alphabetic() || c == '(')
        .trim_end_matches(')')
        .trim();
    let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
    if parts.len() >= 3 {
        let r = parts[0].parse().unwrap_or(0);
        let g = parts[1].parse().unwrap_or(0);
        let b = parts[2].parse().unwrap_or(0);
        (r, g, b)
    } else {
        (0, 0, 0)
    }
}

fn parse_hsl_color(input: &str) -> (u8, u8, u8) {
    let inner = input
        .trim_start_matches(|c: char| c.is_alphabetic() || c == '(')
        .trim_end_matches(')')
        .trim();
    let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
    if parts.len() >= 3 {
        let h: f64 = parts[0].parse().unwrap_or(0.0);
        let s: f64 = parts[1].trim_end_matches('%').parse().unwrap_or(0.0) / 100.0;
        let l: f64 = parts[2].trim_end_matches('%').parse().unwrap_or(0.0) / 100.0;
        hsl_to_rgb(h, s, l)
    } else {
        (0, 0, 0)
    }
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let r = r as f64 / 255.0;
    let g = g as f64 / 255.0;
    let b = b as f64 / 255.0;

    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    let d = max - min;

    let h = if d == 0.0 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / d) % 6.0)
    } else if max == g {
        60.0 * (((b - r) / d) + 2.0)
    } else {
        60.0 * (((r - g) / d) + 4.0)
    };
    let h = if h < 0.0 { h + 360.0 } else { h };

    let s = if d == 0.0 {
        0.0
    } else {
        d / (1.0 - (2.0 * l - 1.0).abs())
    };

    (h, s, l)
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;

    let (r1, g1, b1) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    (
        ((r1 + m) * 255.0).round() as u8,
        ((g1 + m) * 255.0).round() as u8,
        ((b1 + m) * 255.0).round() as u8,
    )
}

// ============ Unit Conversion ============

fn convert_unit(value: f64, from: &str, to: &str, category: &str) -> f64 {
    match category.to_lowercase().as_str() {
        "length" | "distance" => convert_length(value, from, to),
        "weight" | "mass" => convert_weight(value, from, to),
        "temperature" | "temp" => convert_temperature(value, from, to),
        "area" => convert_area(value, from, to),
        "volume" => convert_volume(value, from, to),
        "speed" | "velocity" => convert_speed(value, from, to),
        _ => 0.0,
    }
}

fn convert_length(value: f64, from: &str, to: &str) -> f64 {
    // Convert to meters first
    let meters = match from.to_lowercase().as_str() {
        "mm" | "millimeter" | "millimeters" => value / 1000.0,
        "cm" | "centimeter" | "centimeters" => value / 100.0,
        "m" | "meter" | "meters" => value,
        "km" | "kilometer" | "kilometers" => value * 1000.0,
        "in" | "inch" | "inches" => value * 0.0254,
        "ft" | "foot" | "feet" => value * 0.3048,
        "yd" | "yard" | "yards" => value * 0.9144,
        "mi" | "mile" | "miles" => value * 1609.344,
        _ => return 0.0,
    };

    match to.to_lowercase().as_str() {
        "mm" | "millimeter" | "millimeters" => meters * 1000.0,
        "cm" | "centimeter" | "centimeters" => meters * 100.0,
        "m" | "meter" | "meters" => meters,
        "km" | "kilometer" | "kilometers" => meters / 1000.0,
        "in" | "inch" | "inches" => meters / 0.0254,
        "ft" | "foot" | "feet" => meters / 0.3048,
        "yd" | "yard" | "yards" => meters / 0.9144,
        "mi" | "mile" | "miles" => meters / 1609.344,
        _ => 0.0,
    }
}

fn convert_weight(value: f64, from: &str, to: &str) -> f64 {
    let grams = match from.to_lowercase().as_str() {
        "mg" | "milligram" | "milligrams" => value / 1000.0,
        "g" | "gram" | "grams" => value,
        "kg" | "kilogram" | "kilograms" => value * 1000.0,
        "t" | "tonne" | "tonnes" | "metric_ton" => value * 1000000.0,
        "oz" | "ounce" | "ounces" => value * 28.349523125,
        "lb" | "lbs" | "pound" | "pounds" => value * 453.59237,
        _ => return 0.0,
    };

    match to.to_lowercase().as_str() {
        "mg" | "milligram" | "milligrams" => grams * 1000.0,
        "g" | "gram" | "grams" => grams,
        "kg" | "kilogram" | "kilograms" => grams / 1000.0,
        "t" | "tonne" | "tonnes" | "metric_ton" => grams / 1000000.0,
        "oz" | "ounce" | "ounces" => grams / 28.349523125,
        "lb" | "lbs" | "pound" | "pounds" => grams / 453.59237,
        _ => 0.0,
    }
}

fn convert_temperature(value: f64, from: &str, to: &str) -> f64 {
    // Convert to Celsius first
    let celsius = match from.to_lowercase().as_str() {
        "c" | "celsius" => value,
        "f" | "fahrenheit" => (value - 32.0) * 5.0 / 9.0,
        "k" | "kelvin" => value - 273.15,
        _ => return 0.0,
    };

    match to.to_lowercase().as_str() {
        "c" | "celsius" => celsius,
        "f" | "fahrenheit" => celsius * 9.0 / 5.0 + 32.0,
        "k" | "kelvin" => celsius + 273.15,
        _ => 0.0,
    }
}

fn convert_area(value: f64, from: &str, to: &str) -> f64 {
    let sq_meters = match from.to_lowercase().as_str() {
        "mm2" | "sq_mm" => value / 1000000.0,
        "cm2" | "sq_cm" => value / 10000.0,
        "m2" | "sq_m" => value,
        "km2" | "sq_km" => value * 1000000.0,
        "ha" | "hectare" | "hectares" => value * 10000.0,
        "acre" | "acres" => value * 4046.8564224,
        "ft2" | "sq_ft" => value * 0.09290304,
        "in2" | "sq_in" => value * 0.00064516,
        _ => return 0.0,
    };

    match to.to_lowercase().as_str() {
        "mm2" | "sq_mm" => sq_meters * 1000000.0,
        "cm2" | "sq_cm" => sq_meters * 10000.0,
        "m2" | "sq_m" => sq_meters,
        "km2" | "sq_km" => sq_meters / 1000000.0,
        "ha" | "hectare" | "hectares" => sq_meters / 10000.0,
        "acre" | "acres" => sq_meters / 4046.8564224,
        "ft2" | "sq_ft" => sq_meters / 0.09290304,
        "in2" | "sq_in" => sq_meters / 0.00064516,
        _ => 0.0,
    }
}

fn convert_volume(value: f64, from: &str, to: &str) -> f64 {
    let liters = match from.to_lowercase().as_str() {
        "ml" | "milliliter" | "milliliters" => value / 1000.0,
        "l" | "liter" | "liters" => value,
        "m3" | "cubic_meter" => value * 1000.0,
        "cm3" | "cubic_cm" | "cc" => value / 1000.0,
        "gallon" | "gallons" | "gal" => value * 3.785411784,
        "quart" | "quarts" | "qt" => value * 0.946352946,
        "pint" | "pints" | "pt" => value * 0.473176473,
        "cup" | "cups" => value * 0.2365882365,
        "floz" | "fl_oz" | "fluid_ounce" => value * 0.0295735296,
        _ => return 0.0,
    };

    match to.to_lowercase().as_str() {
        "ml" | "milliliter" | "milliliters" => liters * 1000.0,
        "l" | "liter" | "liters" => liters,
        "m3" | "cubic_meter" => liters / 1000.0,
        "cm3" | "cubic_cm" | "cc" => liters * 1000.0,
        "gallon" | "gallons" | "gal" => liters / 3.785411784,
        "quart" | "quarts" | "qt" => liters / 0.946352946,
        "pint" | "pints" | "pt" => liters / 0.473176473,
        "cup" | "cups" => liters / 0.2365882365,
        "floz" | "fl_oz" | "fluid_ounce" => liters / 0.0295735296,
        _ => 0.0,
    }
}

fn convert_speed(value: f64, from: &str, to: &str) -> f64 {
    let mps = match from.to_lowercase().as_str() {
        "mps" | "m/s" => value,
        "kmh" | "km/h" | "kph" => value / 3.6,
        "mph" => value * 0.44704,
        "knot" | "knots" | "kn" => value * 0.514444,
        "fps" | "ft/s" => value * 0.3048,
        _ => return 0.0,
    };

    match to.to_lowercase().as_str() {
        "mps" | "m/s" => mps,
        "kmh" | "km/h" | "kph" => mps * 3.6,
        "mph" => mps / 0.44704,
        "knot" | "knots" | "kn" => mps / 0.514444,
        "fps" | "ft/s" => mps / 0.3048,
        _ => 0.0,
    }
}

// ============ Exchange Rates ============

fn get_exchange_rates() -> Vec<(&'static str, f64)> {
    // USD-based rates (approximate, for reference)
    vec![
        ("USD", 1.0),
        ("EUR", 0.92),
        ("GBP", 0.79),
        ("JPY", 150.0),
        ("CNY", 7.24),
        ("KRW", 1330.0),
        ("HKD", 7.82),
        ("AUD", 1.52),
        ("CAD", 1.36),
        ("CHF", 0.88),
        ("SGD", 1.34),
        ("INR", 83.0),
        ("RUB", 92.0),
        ("BRL", 5.0),
        ("TWD", 31.5),
        ("THB", 35.5),
        ("NZD", 1.64),
        ("MXN", 17.0),
        ("ZAR", 18.5),
        ("TRY", 32.0),
    ]
}

// ============ Cron Expression Parsing ============

fn parse_cron_expression(expr: &str) -> CronResult {
    let parts: Vec<&str> = expr.trim().split_whitespace().collect();

    if parts.len() != 5 && parts.len() != 6 {
        return CronResult {
            expression: expr.to_string(),
            description: String::new(),
            valid: false,
            message: format!("Cron expression must have 5 or 6 fields, got {}", parts.len()),
            next_runs: vec![],
        };
    }

    let mut has_6 = false;
    let sec_idx = 0;
    let min_idx;
    let hour_idx;
    let dom_idx;
    let month_idx;
    let dow_idx;

    if parts.len() == 6 {
        has_6 = true;
        min_idx = 1;
        hour_idx = 2;
        dom_idx = 3;
        month_idx = 4;
        dow_idx = 5;
    } else {
        min_idx = 0;
        hour_idx = 1;
        dom_idx = 2;
        month_idx = 3;
        dow_idx = 4;
    }

    let minute = parts[min_idx];
    let hour = parts[hour_idx];
    let dom = parts[dom_idx];
    let month = parts[month_idx];
    let dow = parts[dow_idx];
    let second = if has_6 { Some(parts[sec_idx]) } else { None };

    let mut desc_parts: Vec<String> = Vec::new();

    if let Some(s) = second {
        desc_parts.push(format_field(s, "second", 0, 59));
    }
    desc_parts.push(format_field(minute, "minute", 0, 59));
    desc_parts.push(format_field(hour, "hour", 0, 23));
    desc_parts.push(format_dom(dom));
    desc_parts.push(format_month_field(month));
    desc_parts.push(format_dow(dow));

    let description = desc_parts.join(", ");

    // Calculate next few run times using chrono
    let next_runs = calculate_next_runs(second, minute, hour, dom, month, dow, 3);

    CronResult {
        expression: expr.to_string(),
        description,
        valid: true,
        message: "Valid cron expression".into(),
        next_runs,
    }
}

fn format_field(field: &str, name: &str, min: u32, max: u32) -> String {
    if field == "*" {
        return format!("every {}", name);
    }
    if field.starts_with("*/") {
        let n: u32 = field[2..].parse().unwrap_or(1);
        return format!("every {} {}s", n, name);
    }
    if field.contains(',') {
        return format!("at {}s {}", field, name);
    }
    if field.contains('-') {
        return format!("{}s {} through {}", name, field, name);
    }
    let _ = (min, max);
    format!("at {} {}", field, name)
}

fn format_dom(field: &str) -> String {
    if field == "*" {
        "every day".to_string()
    } else if field.starts_with("*/") {
        let n: u32 = field[2..].parse().unwrap_or(1);
        format!("every {} days", n)
    } else {
        format!("on day {} of the month", field)
    }
}

fn format_month_field(field: &str) -> String {
    if field == "*" {
        "every month".to_string()
    } else if field.starts_with("*/") {
        let n: u32 = field[2..].parse().unwrap_or(1);
        format!("every {} months", n)
    } else {
        let month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let parts: Vec<String> = field.split(',').map(|p| {
            if let Ok(n) = p.parse::<usize>() {
                if n >= 1 && n <= 12 {
                    month_names[n - 1].to_string()
                } else {
                    p.to_string()
                }
            } else {
                p.to_string()
            }
        }).collect();
        format!("in {}", parts.join(", "))
    }
}

fn format_dow(field: &str) -> String {
    if field == "*" {
        "every day of week".to_string()
    } else if field.starts_with("*/") {
        let n: u32 = field[2..].parse().unwrap_or(1);
        format!("every {} days of week", n)
    } else {
        let day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        let parts: Vec<String> = field.split(',').map(|p| {
            if let Ok(n) = p.parse::<usize>() {
                if n <= 6 {
                    day_names[n].to_string()
                } else {
                    p.to_string()
                }
            } else {
                p.to_string()
            }
        }).collect();
        format!("on {}", parts.join(", "))
    }
}

fn parse_cron_field(field: &str, min: u32, max: u32) -> Option<Vec<u32>> {
    let mut result = Vec::new();

    for part in field.split(',') {
        if part == "*" {
            for i in min..=max {
                result.push(i);
            }
        } else if part.starts_with("*/") {
            let step: u32 = part[2..].parse().ok()?;
            let mut i = min;
            while i <= max {
                result.push(i);
                i += step;
            }
        } else if part.contains('-') {
            let bounds: Vec<&str> = part.split('-').collect();
            if bounds.len() == 2 {
                let start: u32 = bounds[0].parse().ok()?;
                let end: u32 = bounds[1].parse().ok()?;
                for i in start..=end {
                    result.push(i);
                }
            }
        } else {
            let val: u32 = part.parse().ok()?;
            if val >= min && val <= max {
                result.push(val);
            }
        }
    }

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

fn calculate_next_runs(
    second: Option<&str>,
    minute: &str,
    hour: &str,
    dom: &str,
    month: &str,
    dow: &str,
    count: usize,
) -> Vec<String> {
    use chrono::{Duration, Local, TimeZone};

    let seconds = if let Some(s) = second {
        parse_cron_field(s, 0, 59).unwrap_or_else(|| (0..=59).collect())
    } else {
        vec![0]
    };
    let minutes = parse_cron_field(minute, 0, 59).unwrap_or_else(|| (0..=59).collect());
    let hours = parse_cron_field(hour, 0, 23).unwrap_or_else(|| (0..=23).collect());
    let doms = parse_cron_field(dom, 1, 31).unwrap_or_else(|| (1..=31).collect());
    let months = parse_cron_field(month, 1, 12).unwrap_or_else(|| (1..=12).collect());
    let dows = parse_cron_field(dow, 0, 7).unwrap_or_else(|| (0..=7).collect());

    let mut next_runs = Vec::new();
    let now = Local::now();
    let mut search_time = now + Duration::seconds(1);
    let max_iterations = 525600; // 1 year in minutes

    for _ in 0..max_iterations {
        if next_runs.len() >= count {
            break;
        }

        let sec = search_time.second();
        let min = search_time.minute();
        let hr = search_time.hour();
        let day = search_time.day();
        let mon = search_time.month();
        let weekday = search_time.weekday().num_days_from_sunday();
        // Handle Sunday=7 in cron (7 also means Sunday)
        let weekday_matches = dows.contains(&weekday) || (weekday == 0 && dows.contains(&7));

        if months.contains(&mon)
            && doms.contains(&day)
            && weekday_matches
            && hours.contains(&hr)
            && minutes.contains(&min)
            && seconds.contains(&sec)
        {
            next_runs.push(search_time.format("%Y-%m-%d %H:%M:%S %Z").to_string());
            search_time = search_time + Duration::seconds(1);
        } else {
            // Skip ahead intelligently
            if !months.contains(&mon) {
                search_time = search_time
                    .with_day(1)
                    .unwrap_or(search_time)
                    .with_hour(0)
                    .unwrap_or(search_time)
                    .with_minute(0)
                    .unwrap_or(search_time)
                    .with_second(0)
                    .unwrap_or(search_time);
                search_time = search_time + Duration::days(32);
                continue;
            }
            if !doms.contains(&day) || !weekday_matches {
                search_time = search_time
                    .with_hour(0)
                    .unwrap_or(search_time)
                    .with_minute(0)
                    .unwrap_or(search_time)
                    .with_second(0)
                    .unwrap_or(search_time);
                search_time = search_time + Duration::days(1);
                continue;
            }
            if !hours.contains(&hr) {
                search_time = search_time
                    .with_minute(0)
                    .unwrap_or(search_time)
                    .with_second(0)
                    .unwrap_or(search_time);
                search_time = search_time + Duration::hours(1);
                continue;
            }
            if !minutes.contains(&min) {
                search_time = search_time.with_second(0).unwrap_or(search_time);
                search_time = search_time + Duration::minutes(1);
                continue;
            }
            if !seconds.contains(&sec) {
                search_time = search_time + Duration::seconds(1);
                continue;
            }
        }
    }

    if next_runs.is_empty() {
        next_runs.push("Could not find a matching time within 1 year".into());
    }

    next_runs
}

// Need to import Datelike and Timelike for chrono date/time access
use chrono::{Datelike, Timelike};
