let docready = false;
let storageready = false;

let config: config_type | null = null;

document.addEventListener("DOMContentLoaded", function (event) {
    docready = true;
    wait_for_both()
});

get_config().then(items => {
    config = items as config_type;
    storageready = true;
    wait_for_both()
})

function wait_for_both() {
    if (docready && storageready) {
        setup_config()
    }
}

const id = document.getElementById.bind(document) as (id: string) => HTMLElement;


function setup_config() {
    if (config === null) {
        throw new Error("huh?");
    }
    // global enable switch
    const global_enable = (id("enable") as HTMLInputElement);
    global_enable.checked = config.enabled;
    global_enable.addEventListener("change", () => {
        config!["enabled"] = global_enable.checked;
    });
    // save
    const sn = id("save-name");
    id("save").addEventListener("click", () => {
        chrome.storage.sync.set(config!).then(() => {
            return handle_mode()
        }).then(() => {
            sn.innerText = "Saved! Reload any open pages to see changes.";
            sn.classList.add("text-success");
            sn.classList.remove("text-danger");
        }).catch((e) => {
            sn.innerText = "Error saving config! " + e;
            sn.classList.remove("text-success");
            sn.classList.add("text-danger");
        })

    })
    // font selection
    for (const [f_type, {enabled, name}] of Object.entries(config["font-options"])) {
        const enable_switch = (id(`${f_type.replace("_", "-")}-font-enable`) as HTMLInputElement);
        const font_name = (id(`${f_type.replace("_", "-")}-font-name`) as HTMLInputElement);
        // enable switch
        enable_switch.checked = enabled;
        if (enable_switch.checked) {
            font_name.removeAttribute("disabled")
        } else {
            font_name.setAttribute("disabled", "true")
        }
        enable_switch.addEventListener("change", () => {
            config!["font-options"][f_type as keyof config_type["font-options"]]["enabled"] = enable_switch.checked;
            if (enable_switch.checked) {
                font_name.removeAttribute("disabled")
            } else {
                font_name.setAttribute("disabled", "true")
            }
        });

        // font name
        let fallback_type;
        if (["normal", "math", "unknown"].includes(f_type)) {
            fallback_type = "sans-serif";
        } else {
            fallback_type = f_type;
        }
        font_name.value = name;
        font_name.addEventListener("change", () => {
            config!["font-options"][f_type as keyof config_type["font-options"]]["name"] = font_name.value;
            font_name.style.setProperty("font-family", `"${font_name.value}", ${fallback_type}`);
        });
        font_name.style.setProperty("font-family", `"${font_name.value}", ${fallback_type}`);
    }

    // specificity
    const spec = config.specificity;
    id(`spec-${spec}`).setAttribute("checked", "true");
    handle_spec(spec);
    id("spec").addEventListener("change", () => {
        const spec = (document.querySelector('input[name="spec"]:checked') as HTMLInputElement).value;
        config!.specificity = spec as config_type["specificity"];
        handle_spec(spec as config_type["specificity"]);
    })
}

function handle_spec(spec: config_type["specificity"]) {
    document.querySelectorAll(`.spec.spec-${spec}`).forEach((el) => {
        el.classList.remove("d-none");
    });
    document.querySelectorAll(`.spec:not(.spec-${spec})`).forEach((el) => {
        el.classList.add("d-none");
    });
}