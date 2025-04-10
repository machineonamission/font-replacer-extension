// intercept any document JS rule injections, and send them to the content script
(function () {
    // Save references to the original methods.
    const originalInsertRule = CSSStyleSheet.prototype.insertRule;
    const originalAddRule = CSSStyleSheet.prototype.addRule;
    const originalReplace = CSSStyleSheet.prototype.replace;
    const originalReplaceSync = CSSStyleSheet.prototype.replaceSync;

    // Helper function: dispatch a custom event with method name, arguments, and result.
    function add_event(rules: serializable_rule[]) {
        const event = new CustomEvent("frankenfont-css-rules", {detail: rules});
        document.dispatchEvent(event);
    }

    function serialize_rule(rule: CSSRule): serializable_rule | null {
        if (rule instanceof CSSStyleRule && (rule.style.font || rule.style.fontFamily)) {
            return {
                font: rule.style.font,
                font_family: rule.style.fontFamily,
                selector: rule.selectorText
            }
        } else {
            return null
        }
    }

    // serialize and then send the rule
    function serialize_and_send_rules(rules: CSSRule[]) {
        let serialized = rules
            .map(serialize_rule)
            .filter(r => r !== null);
        if (serialized.length > 0) {
            add_event(serialized);
        }
    }

    // iterate over every css rule in the sheet and serialize and send them
    function handle_sheet(sheet: CSSRuleList) {
        add_event(serialize_sheet(sheet))
    }

    function serialize_sheet(sheet: CSSRuleList) {
        let rules: serializable_rule[] = [];
        for (const rule of sheet) {
            if (rule instanceof CSSStyleRule) {
                const s = serialize_rule(rule);
                if (s) {
                    rules.push(s);
                }
            } else if (rule instanceof CSSGroupingRule) {
                // unwrap grouping rules, shouldnt matter if theyre media queries or whatever cause all fonts are
                // replaced
                rules = rules.concat(serialize_sheet(rule.cssRules));
            }
        }
        return rules;
    }

    // Override insertRule.
    CSSStyleSheet.prototype.insertRule = function (rule, index) {
        const result = originalInsertRule.call(this, rule, index);
        serialize_and_send_rules([this.cssRules[result]]);
        return result;
    };

    // Override addRule.
    CSSStyleSheet.prototype.addRule = function (selector, rule, index) {
        const result = originalAddRule.call(this, selector, rule, index);
        serialize_and_send_rules([this.cssRules[result]]);
        return result;
    };

    // Override replace (which returns a Promise).
    CSSStyleSheet.prototype.replace = function (rule) {
        const resultPromise = originalReplace.call(this, rule);
        resultPromise.then(s => {
            // Handle the new CSSStyleSheet.
            handle_sheet(this.cssRules);
        })
        return resultPromise;
    };

    // Override replaceSync.
    CSSStyleSheet.prototype.replaceSync = function (rule) {
        originalReplaceSync.call(this, rule);
        handle_sheet(this.cssRules)
    };

    // console.log("CSSStyleSheet methods have been overridden.");
    // Save the original descriptor so you can call the real setter/getter later
    const originalDescriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font')!;

    // Define a new property descriptor
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
        get: function () {
            console.log('Custom font getter called with:');
            return originalDescriptor.get!.call(this);
        },
        set: function (value) {
            console.log('Custom font setter called with:', value);

            // You can modify the value here if you want
            // const newValue = value + ' /* intercepted */';

            // Call the original setter
            originalDescriptor.set!.call(this, value);
        },
        configurable: true,
        enumerable: true
    });
})();
