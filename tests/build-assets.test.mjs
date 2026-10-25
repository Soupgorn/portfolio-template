import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { checkBuildAssets } from '../scripts/check-build-assets.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'portfolio-build-assets-'));
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    assert.ok(root.includes('portfolio-build-assets-'));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test('static HTML, avatars and an empty audio directory are allowed', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'audio'));
  writeFileSync(join(root, 'index.html'), '<p>Portfolio</p>');
  writeFileSync(join(root, 'avatar.svg'), '<svg />');
  assert.equal(checkBuildAssets([join(root, 'missing'), root]), 1);
});

test('a genuine nested local-audio leak fails the build guard', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'nested', 'audio'), { recursive: true });
  for (const extension of ['mp3', 'WAV', 'm4a', 'ogg', 'flac', 'aac', 'opus']) {
    const path = join(root, 'nested', 'audio', `private.${extension}`);
    writeFileSync(path, 'synthetic test bytes');
    assert.throws(() => checkBuildAssets([root]), /Local audio found/);
    rmSync(path);
  }
});

test('missing build output cannot produce a misleading pass', t => {
  const root = fixture(t);
  assert.throws(() => checkBuildAssets([join(root, 'missing')]), /No static build output/);
});
