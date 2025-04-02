declare function parseFontFamily(name: string): string[];

declare function parseFont(name: string): {
    'font-family': string[]
    'font-size': string
    'line-height': string
};

let config: {
    url_whitelist: string[],
    url_blacklist: string[],
    "font-options": {
        serif: string,
        "sans-serif": string,
        monospace: string,
        fantasy: string,
        cursive: string
    },
    replace_unknown_fonts: boolean,
    mode: "css" | "js" | "off",
} = {
    "url_whitelist": ["*"],
    "url_blacklist": [],
    "font-options": {
        "serif": "Atkinson Hyperlegible Next",
        "sans-serif": "Atkinson Hyperlegible Next",
        "monospace": "Atkinson Hyperlegible Mono",
        "fantasy": "Atkinson Hyperlegible Next",
        "cursive": "Atkinson Hyperlegible Next"
    },
    "replace_unknown_fonts": false,
    "mode": "js", // css, js, off
}

const reverse_font_mapping: { [key: string]: string[] } = {
    "serif": ["serif", "ui-sans-serif", "system-ui", "ui-rounded", "arial", "verdana", "tahoma", "trebuchet ms"],
    "sans-serif": ["sans-serif", "ui-sans-serif", "times new roman", "georgia", "garamond"],
    "cursive": ["cursive", "brush script mt"],
    "fantasy": ["fantasy"],
    "monospace": ["monospace", "ui-monospace", "courier", "courier new"],
    "none": ["emoji", "math"]
}
let font_mapping: { [key: string]: string } = {}
for (let key in reverse_font_mapping) {
    for (let value of reverse_font_mapping[key]) {
        font_mapping[value] = key;
    }
}

const css_noops = [
    "inherit",
    "initial",
    "revert",
    "revert-layer",
    "unset"
]

if (config.mode === "css") {
    // TODO
} else if (config.mode === "js") {
    function get_font_type(fonts: string[]): keyof typeof reverse_font_mapping {
        for (let font of fonts) {
            if (font_mapping[font]) {
                return font_mapping[font];
            }
        }
        return "none"
    }

    function get_computed_style(selector: string, property: string): string | null {
        try {
            let doc = document.querySelector(selector);
            if (!doc) {
                doc = document.documentElement;
            }
            return window.getComputedStyle(doc).getPropertyValue(property);
        } catch (e) {
            console.error("Error getting computed style", e);
            return null;
        }
    }

    function handle_direct_declarations(rule: CSSStyleRule, override_styles: CSSStyleSheet) {
        let style = rule.style;
        let font = style["font" as keyof typeof style] as string | null;
        let fonts: string[] = [];
        if (font && !css_noops.includes(font)) {
            if(font.includes("var(")) {
                font = get_computed_style(rule.selectorText, "font") || font;
            }
            fonts = parseFont(font)["font-family"];
        }
        let font_family = style["font-family" as keyof typeof style] as string | null;
        if (font_family && !css_noops.includes(font_family)) {
            if(font_family.includes("var(")) {
                font_family = get_computed_style(rule.selectorText, "font-family") || font_family;
            }
            fonts = parseFontFamily(font_family);
        }
        if (fonts) {
            let fonttype = get_font_type(fonts);
            if (fonttype !== "none") {
                let new_font = config["font-options"][fonttype as keyof typeof config["font-options"]];
                fonts.unshift(new_font)
                let new_font_family = fonts.map(f => `"${f}"`).join(", ");
                if (new_font) {
                    override_styles.insertRule(`${rule.selectorText} { font-family: ${new_font_family} !important; }`);
                }
            }
        }
    }

    function handle_variables(rule: CSSStyleRule, override_styles: CSSStyleSheet) {
        for (const style of rule.style) {
            if (style.startsWith("--")) {
                try {
                    let original_value = rule.style.getPropertyValue(style);
                    if (original_value.includes("var(")) {
                        try {
                            let doc: Element;
                            if (rule.selectorText.startsWith(":")) {
                                doc = document.documentElement;
                            } else {
                                doc = document.querySelector(rule.selectorText) as Element;
                            }
                            original_value = window.getComputedStyle(doc).getPropertyValue(style);
                        } catch (e) {
                            console.error("Error getting computed style", e);
                        }
                    }
                    let fonts: string[] | null = null;
                    let parsed = parseFont(original_value);
                    if (parsed) {
                        fonts = parsed["font-family"];
                    } else {
                        fonts = parseFontFamily(original_value);
                    }
                    if (fonts) {
                        let fonttype = get_font_type(fonts);
                        if (fonttype !== "none") {
                            let new_font = config["font-options"][fonttype as keyof typeof config["font-options"]];
                            fonts.unshift(new_font)
                            let new_font_family = fonts.map(f => `"${f}"`).join(", ");
                            if (new_font) {
                                override_styles.insertRule(`${rule.selectorText} { ${style}: ${new_font_family} !important; }`);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error handling css variable", e);
                }
            }
        }
    }

    function handle_css(rules: CSSRuleList) {
        let override_styles = new CSSStyleSheet();
        // for all css declarations in the sheet
        for (let rule of rules) {
            // for all normal rules
            if (rule instanceof CSSStyleRule) {
                try {
                    handle_direct_declarations(rule, override_styles);
                    // handle_variables(rule, override_styles);
                } catch (e) {
                    console.error("Error handling css rule", e);
                }

            }
        }
        document.adoptedStyleSheets.push(override_styles);
    }

    function parse_css(text: string) {
        const sheet = new CSSStyleSheet();
        sheet.replace(text)
            .then(() => {
                handle_css(sheet.cssRules)
            })
            .catch(err => {
                console.error('Failed to replace styles:', err);
            });
    }

    function handle_link(node: HTMLLinkElement) {
        let rules: CSSRuleList | null = null;
        node.addEventListener("load", () => {
            try {
                if (node.sheet) {
                    rules = node.sheet.cssRules;
                }
            } catch (e) {
                if ((e as DOMException).name === "SecurityError") {
                    chrome.runtime.sendMessage(node.href, (r: { "status": "ok", "text": string }
                        | { "status": "error", "error": string }
                    ) => {
                        if (r.status === "ok") {
                            parse_css(r.text)
                        } else {
                            console.error("Error fetching css file", r.error);
                        }
                    });
                } else {
                    console.error("Unknown Error at accessing cssRules", e);
                }
            } finally {
                if (rules) {
                    handle_css(rules);
                }
            }
        });
    }

    // Set up a MutationObserver to watch for added nodes (in document.head and optionally elsewhere)
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) {
                    if (node instanceof HTMLStyleElement) {
                        if (node.sheet) {
                            handle_css(node.sheet.cssRules)
                        }
                    } else if (node instanceof HTMLLinkElement && node.rel === "stylesheet") {
                        handle_link(node);
                    }
                }
            }
        }
    });

    observer.observe(document, {childList: true, subtree: true});
    // for all stylesheets
    for (let sheet of document.styleSheets) {
        try {
            (sheet.ownerNode as Element).setAttribute("crossorigin", "anonymous");
            if (sheet.cssRules) {

            }
        } catch (SecurityError) {
            // nothing
            console.error("SecurityError")
            debugger
        }
    }
}

