/** Compact, stable class labels; inspection identities and counts never change. */
export function defectClassInitials(name: string): string {
  const words = name.replace(/^(defect|fail)\s*:\s*/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').match(/[A-Za-z0-9]+/g) || [];
  const letters = words.filter(word => !/^\d+$/.test(word)).slice(0, 4).map(word => word[0]).join('').toUpperCase();
  const number = words.at(-1)?.match(/^\d+$/)?.[0];
  return (letters || 'D') + (number || '');
}

/** Distinct HALCON classes sharing initials still have distinct visible codes. */
export function defectClassCodes(names: readonly string[]): ReadonlyMap<string, string> {
  const groups = new Map<string, string[]>();
  for (const name of new Set(names)) {
    const code = defectClassInitials(name);
    groups.set(code, [...(groups.get(code) || []), name]);
  }
  const codes = new Map<string, string>();
  const reserved = new Set(groups.keys());
  for (const [base, group] of groups) {
    if (group.length === 1) { codes.set(group[0], base); continue; }
    group.sort((a,b) => a.localeCompare(b,'en',{numeric:true}));
    let index = 1;
    for (const name of group) {
      let code = `${base}${index++}`;
      while (reserved.has(code)) code = `${base}${index++}`;
      reserved.add(code); codes.set(name, code);
    }
  }
  return codes;
}
