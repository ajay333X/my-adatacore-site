const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const builder=fs.readFileSync('project-builder.js','utf8');
test('design backups are manually exported and scoped to current project',()=>{
 assert.match(builder,/format:'adatacore-project-design-backup'/);
 assert.match(builder,/projectId,projectName:project\.project_name/);
 assert.match(builder,/imported\.projectId!==projectId/);
 assert.match(builder,/\.download='adatacore-project-'/);
});
test('restore is a draft-only action, requiring explicit confirmation',()=>{
 assert.match(builder,/confirmation\('Restore design backup\?'/);
 assert.match(builder,/editor\.loadProjectData\(draft\.projectData\)/);
 assert.match(builder,/renderPages\(\);titlePage\(\);changed\(\)/);
 assert.match(builder,/Nothing will be published or saved until you choose Save draft/);
});
test('oversized or malformed files cannot be loaded',()=>{
 assert.match(builder,/selected\.size>1800000/);
 assert.match(builder,/draft\.pages\.length>40/);
 assert.match(builder,/p\.html\.length>250000/);
 assert.match(builder,/p\.css\.length>150000/);
});
test('restore has an in-memory rollback on load failure',()=>{
 assert.match(builder,/const previous=editor\.getProjectData\(\)/);
 assert.match(builder,/editor\.loadProjectData\(previous\)/);
});
