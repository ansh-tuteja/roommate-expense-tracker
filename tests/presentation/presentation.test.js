describe('Presentation sanity checks', () => {
  test('1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2);
  });

  test('array contains item', () => {
    expect(['a', 'b', 'c']).toContain('b');
  });

  test('string matches regex', () => {
    expect('ExpenseHub').toMatch(/Expense/);
  });

  test('object has property', () => {
    const user = { name: 'Alex', role: 'member' };
    expect(user).toHaveProperty('role', 'member');
  });

  test('truthy value', () => {
    expect('dashboard').toBeTruthy();
  });

  test('falsy value', () => {
    expect(0).toBeFalsy();
  });

  test('array length', () => {
    expect([1, 2, 3, 4].length).toBe(4);
  });

  test('number comparison', () => {
    expect(10).toBeGreaterThan(5);
  });

  test('string not empty', () => {
    expect('settlements'.length).toBeGreaterThan(0);
  });

  test('object equality', () => {
    expect({ a: 1, b: 2 }).toEqual({ a: 1, b: 2 });
  });

  test('array equality', () => {
    expect([1, 2, 3]).toEqual([1, 2, 3]);
  });

  test('map lookup works', () => {
    const m = new Map();
    m.set('key', 'value');
    expect(m.get('key')).toBe('value');
  });

  test('set has value', () => {
    const s = new Set(['x', 'y']);
    expect(s.has('x')).toBe(true);
  });

  test('date is valid', () => {
    const d = new Date();
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  test('reduces correctly', () => {
    const sum = [1, 2, 3, 4, 5].reduce((acc, n) => acc + n, 0);
    expect(sum).toBe(15);
  });
});
