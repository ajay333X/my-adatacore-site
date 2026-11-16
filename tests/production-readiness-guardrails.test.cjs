'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('supabase/migrations/20261116103031_restrict_anonymous_privileged_rpcs_20261116.sql','utf8');
const backup=fs.readFileSync('scripts/backup-supabase-storage.cjs','utf8');
const workflow=fs.readFileSync('.github/workflows/adatacore-encrypted-backup.yml','utf8');

test('anonymous admin RPC execution is revoked in tracked migration',()=>{
  for(const name of [
    'admin_delete_application','admin_get_inactivity_policy','admin_get_quality_escalation_rule',
    'admin_people360_set_project_limit','admin_people_quality_timeline',
    'admin_project_smart_groups','admin_set_inactivity_policy','admin_set_quality_escalation_rule'
  ]) assert.match(migration,new RegExp('revoke execute on function public\\.'+name+'\\('));
  assert.doesNotMatch(migration,/revoke execute on function public\.get_platform_status/);
  assert.doesNotMatch(migration,/revoke execute on function public\.public_log_voice_recruitment_event/);
});
test('backup exporter has valid syntax and refuses missing credentials',()=>{
  assert.doesNotThrow(()=>new Function(backup));
  assert.match(backup,/BACKUP_SERVICE_ROLE_KEY/);
  assert.match(backup,/object\/authenticated/);
  assert.match(backup,/manifest\.json/);
});
test('encrypted backup cannot run automatically before secrets and restore drill',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^\s+schedule:/m);
  assert.match(workflow,/age -r/);
  assert.match(workflow,/upload-artifact@v4/);
  assert.match(workflow,/if-no-files-found: error/);
  assert.doesNotMatch(workflow,/echo.*BACKUP_SERVICE_ROLE_KEY/);
});
