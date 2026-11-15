const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', 'module', code)(id => id.startsWith('./') ? load(`lib/${id.slice(2)}.ts`) : require(id), mod.exports, mod);
  return mod.exports;
}
const { t } = load('lib/i18n.ts');
const { translationUpdateSchema, rowsToOverrides, LANGS } = load('lib/translations.ts');
assert.equal(t('en', 'giveNow'), 'Give now');
assert.equal(t('sv', 'giveNow', { sv: { giveNow: 'Donera' } }), 'Donera');
assert.equal(t('en', 'giveNow', { sv: { giveNow: 'Donera' } }), 'Give now');
assert.equal(t('en', 'nope'), 'nope');
assert.equal(translationUpdateSchema.safeParse({ lang: 'en', key: 'giveNow', value: 'Donate' }).success, true);
assert.equal(translationUpdateSchema.safeParse({ lang: 'en', key: 'giveNow', value: '' }).success, true);
assert.equal(translationUpdateSchema.safeParse({ lang: 'de', key: 'giveNow', value: 'x' }).success, false);
assert.equal(translationUpdateSchema.safeParse({ lang: 'en', key: 'unknown', value: 'x' }).success, false);
assert.equal(translationUpdateSchema.safeParse({ lang: 'en', key: 'gdprText', value: 'x' }).success, false);
assert.equal(translationUpdateSchema.safeParse({ lang: 'en', key: 'giveNow', value: 'x'.repeat(601) }).success, false);
assert.deepEqual(rowsToOverrides([{ lang: 'sv', key: 'giveNow', value: 'Donera' }, { lang: 'xx', key: 'giveNow', value: 'a' }, { lang: 'sv', key: 'gdprText', value: 'a' }, { lang: 'sv', key: 'gone', value: 'a' }]), { sv: { giveNow: 'Donera' } });
assert.deepEqual(rowsToOverrides(null), {});
assert.deepEqual(LANGS, ['en', 'sv', 'ar']);
console.log('translations ok');
