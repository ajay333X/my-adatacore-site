(() => {
  const navGroup = document.querySelector('.sidebar .nav-group');
  if (!navGroup || navGroup.querySelector('[data-recording-audit-link]')) return;
  const finalAudit = navGroup.querySelector('[data-tab="submissions"]');
  if (finalAudit) finalAudit.textContent = 'Submission approvals';
  const link = document.createElement('a');
  link.className = 'nav-link';
  link.href = '/admin/recordings';
  link.dataset.recordingAuditLink = 'true';
  link.textContent = 'Recording audit';
  if (finalAudit) finalAudit.insertAdjacentElement('afterend', link);
  else navGroup.appendChild(link);
})();
