import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRepoInput, cleanToken, looksLikeToken, makeConnectLink, parseConnectCode } from '../js/connect-link.js';
import { parseRepo } from '../js/sync-github.js';

const TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';

test('la clé collée est nettoyée (espaces, retours à la ligne, caractères invisibles)', () => {
  const pasted = ` github_pat_11ABCDEFG0123456789_abcdefghijklmnop\nqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd​ `;
  assert.equal(cleanToken(pasted), TOKEN);
  assert.ok(looksLikeToken(TOKEN));
  assert.ok(!looksLikeToken('github_pat_123'), 'clé coupée');
  assert.ok(!looksLikeToken('MonMotDePasse!2026'));
});

test('le nom du dépôt corrigé par l’iPhone est réparé', () => {
  assert.equal(parseRepo(cleanRepoInput(' Hhwk6c5yky-ctrl/mnémo-données ')), 'Hhwk6c5yky-ctrl/mnemo-donnees');
  assert.equal(parseRepo(cleanRepoInput('pseudo/mnemo–donnees')), 'pseudo/mnemo-donnees');
  assert.equal(parseRepo('https://github.com/pseudo/mnemo-donnees.git'), 'pseudo/mnemo-donnees');
  assert.equal(parseRepo('mnemo-donnees'), null);
});

test('lien de connexion : aller-retour', () => {
  const link = makeConnectLink('pseudo/mnemo-donnees', TOKEN, 'https://pseudo.github.io/Claude/');
  assert.ok(link.startsWith('https://pseudo.github.io/Claude/#/connect/'));
  assert.deepEqual(parseConnectCode(link), { repo: 'pseudo/mnemo-donnees', token: TOKEN });
  assert.deepEqual(parseConnectCode(link.replace(/(.{40})/g, '$1\n')), { repo: 'pseudo/mnemo-donnees', token: TOKEN }, 'lien coupé en plusieurs lignes');
  assert.equal(parseConnectCode(TOKEN), null, 'une simple clé n’est pas un lien');
  assert.equal(parseConnectCode('n’importe quoi'), null);
});
