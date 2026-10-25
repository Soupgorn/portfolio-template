import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpile(readFileSync(new URL('../src/data/projects.ts', import.meta.url), 'utf8'), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}), { exports });

test('published project records have unique stable slugs and complete gallery content', () => {
  const slugs = new Set();
  for (const project of exports.projects) {
    assert.match(project.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(slugs.has(project.slug), false);
    slugs.add(project.slug);
    assert.ok(project.title.trim());
    assert.ok(project.description.trim());
    assert.ok(project.technologies.length);
    assert.equal(new Set(project.technologies).size, project.technologies.length);
    project.technologies.forEach(technology => assert.ok(technology.trim()));
    project.features?.forEach(feature => assert.ok(feature.trim()));
  }
});

test('published source links are explicitly public HTTPS GitHub repositories', () => {
  for (const project of exports.projects) {
    if (!project.githubUrl) continue;
    assert.equal(project.sourceVisibility, 'public');
    const url = new URL(project.githubUrl);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'github.com');
    assert.equal(url.username + url.password, '');
    assert.match(url.pathname, /^\/[^/]+\/[^/]+$/);
  }
});
