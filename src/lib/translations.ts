import bg from "./locales/bg.json";
import ca from "./locales/ca.json";
import cs from "./locales/cs.json";
import da from "./locales/da.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import eu from "./locales/eu.json";
import fi from "./locales/fi.json";
import fr from "./locales/fr.json";
import hu from "./locales/hu.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import nl from "./locales/nl.json";
import no from "./locales/no.json";
import pl from "./locales/pl.json";
import ptbr from "./locales/ptbr.json";
import ru from "./locales/ru.json";
import sk from "./locales/sk.json";
import sv from "./locales/sv.json";
import tr from "./locales/tr.json";
import ua from "./locales/ua.json";
import vi from "./locales/vi.json";
import zh from "./locales/zh.json";
import zhCN from "./locales/zh-CN.json";
import type {DefinitionWithExtend, Expose, Translations} from "./types";

type LocaleTranslations = Record<
    string,
    {
        label?: string;
        description?: string;
        values?: Record<string, string>;
    }
>;

type GlobalTranslations = Record<string, LocaleTranslations>;

export const globalTranslations: GlobalTranslations = {
    bg: bg as LocaleTranslations,
    ca: ca as LocaleTranslations,
    cs: cs as LocaleTranslations,
    da: da as LocaleTranslations,
    de: de as LocaleTranslations,
    en: en as LocaleTranslations,
    es: es as LocaleTranslations,
    eu: eu as LocaleTranslations,
    fi: fi as LocaleTranslations,
    fr: fr as LocaleTranslations,
    hu: hu as LocaleTranslations,
    it: it as LocaleTranslations,
    ja: ja as LocaleTranslations,
    ko: ko as LocaleTranslations,
    nl: nl as LocaleTranslations,
    no: no as LocaleTranslations,
    pl: pl as LocaleTranslations,
    ptbr: ptbr as LocaleTranslations,
    ru: ru as LocaleTranslations,
    sk: sk as LocaleTranslations,
    sv: sv as LocaleTranslations,
    tr: tr as LocaleTranslations,
    ua: ua as LocaleTranslations,
    vi: vi as LocaleTranslations,
    zh: zh as LocaleTranslations,
    "zh-CN": zhCN as LocaleTranslations,
};

export const i18n = (exposeName: string): Translations => {
    const result: Translations = {};
    for (const [locale, exposes] of Object.entries(globalTranslations)) {
        if (exposes[exposeName]) {
            result[locale] = exposes[exposeName] as Translations[string];
        }
    }
    return result;
};

export const createI18n =
    (vendorTranslations: Translations) =>
    (exposeName: string): Translations => {
        const result: Translations = {};
        const allLocales = new Set([...Object.keys(vendorTranslations), ...Object.keys(globalTranslations)]);

        for (const locale of allLocales) {
            const vendorExpose = vendorTranslations[locale]?.exposes?.[exposeName];
            if (vendorExpose) {
                result[locale] = vendorExpose as Translations[string];
                continue;
            }
            const globalExpose = globalTranslations[locale]?.[exposeName];
            if (globalExpose) {
                result[locale] = globalExpose as Translations[string];
            }
        }
        return result;
    };

export function resolveExposeLabel(expose: Expose, device: DefinitionWithExtend, locale: string): string {
    const deviceOverride = device.translations?.[locale]?.exposes?.[expose.name]?.label;
    if (deviceOverride) return deviceOverride;
    const globalByName = globalTranslations[locale]?.[expose.name]?.label;
    if (globalByName) return globalByName;
    return expose.label;
}

export function resolveExposeValue(exposeName: string, value: string, device: DefinitionWithExtend, locale: string): string {
    const deviceOverride = device.translations?.[locale]?.exposes?.[exposeName]?.values?.[value];
    if (deviceOverride) return deviceOverride;
    const globalValue = globalTranslations[locale]?.[exposeName]?.values?.[value];
    if (globalValue) return globalValue;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export function resolveDescription(device: DefinitionWithExtend, locale: string): string {
    return device.translations?.[locale]?.description ?? device.description;
}
