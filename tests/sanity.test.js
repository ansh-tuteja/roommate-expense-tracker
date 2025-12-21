describe('Sanity Tests', () => {
  test('math works', () => {
    expect(2 + 2).toBe(4);
  });

  test('string includes', () => {
    expect('expensehub').toContain('expense');
  });

  test('array length', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
  });

  test('truthy check', () => {
    expect(true).toBe(true);
  });
});
