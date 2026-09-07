import { describe, expect, it } from 'vitest';
import { filterGarments, findSimilarGarment, garmentWords } from '@/lib/garment-match';

/**
 * Finding a garment, and noticing a duplicate before it is created.
 *
 * "Other clothing type" only matched an existing name letter for letter, so
 * typing "Shirt with Emma" created a second kind of shirt — after which the
 * price list, the counts and every report treated the two as unrelated things.
 */

const LIST = [
  'Shirt', 'Trouser', 'T-shirt', 'Nicker / Shorts', 'Gown / Dress',
  'Skirt', 'Native Wear', 'Jacket', 'Bedsheet', 'Towel', 'Underwear',
];

describe('searching the list', () => {
  it('finds a garment from the start of a word', () => {
    expect(filterGarments(LIST, 'tro')).toEqual(['Trouser']);
    expect(filterGarments(LIST, 'native')).toEqual(['Native Wear']);
  });

  it('finds a word from the middle of a name', () => {
    expect(filterGarments(LIST, 'wear')).toContain('Native Wear');
    expect(filterGarments(LIST, 'wear')).toContain('Underwear');
  });

  it('ignores case and punctuation', () => {
    expect(filterGarments(LIST, 'SHORTS')).toEqual(['Nicker / Shorts']);
    expect(filterGarments(LIST, 't-shirt')).toContain('T-shirt');
  });

  it('shows everything when nothing is typed', () => {
    expect(filterGarments(LIST, '')).toHaveLength(LIST.length);
    expect(filterGarments(LIST, '   ')).toHaveLength(LIST.length);
  });

  it('returns nothing rather than guessing when there is no match', () => {
    expect(filterGarments(LIST, 'bicycle')).toEqual([]);
  });

  it('copes with dropped letters, which is how people type at a counter', () => {
    // "shr" for Shirt returned an empty grid and offered to add a garment
    // that was already on the list.
    expect(filterGarments(LIST, 'shr')[0]).toBe('Shirt');
    expect(filterGarments(LIST, 'trsr')[0]).toBe('Trouser');
    expect(filterGarments(LIST, 'ntv')[0]).toBe('Native Wear');
    expect(filterGarments(LIST, 'bdsht')[0]).toBe('Bedsheet');
  });

  it('copes with a slipped letter', () => {
    expect(filterGarments(LIST, 'shrit')[0]).toBe('Shirt');
    expect(filterGarments(LIST, 'trouser')[0]).toBe('Trouser');
    expect(filterGarments(LIST, 'jaket')[0]).toBe('Jacket');
  });

  it('puts the closest answer first', () => {
    const shr = filterGarments(LIST, 'shr');
    expect(shr[0]).toBe('Shirt');
    expect(shr.indexOf('Shirt')).toBeLessThan(shr.indexOf('Nicker / Shorts'));
  });

  it('does not open the floodgates on a single letter', () => {
    // One letter matches almost anything as a subsequence; only a real prefix
    // counts.
    const one = filterGarments(LIST, 's');
    expect(one.length).toBeLessThan(LIST.length);
    expect(one).toContain('Skirt');
  });
});

describe('spotting a garment already on the list', () => {
  it('recognises a longer name for something that exists', () => {
    expect(findSimilarGarment(LIST, 'Shirt with Emma')).toBe('Shirt');
    expect(findSimilarGarment(LIST, 'Jacket for Musa')).toBe('Jacket');
  });

  it('recognises the plural', () => {
    expect(findSimilarGarment(LIST, 'Shirts')).toBe('Shirt');
    expect(findSimilarGarment(LIST, 'Two towels')).toBe('Towel');
  });

  it('works the other way, when the shorter name is the new one', () => {
    expect(findSimilarGarment(['Shirt Long Sleeve'], 'Shirt')).toBe('Shirt Long Sleeve');
  });

  it('says nothing for an exact name, which needs no question', () => {
    expect(findSimilarGarment(LIST, 'Shirt')).toBeNull();
    expect(findSimilarGarment(LIST, 'shirt')).toBeNull();
    expect(findSimilarGarment(LIST, '  Towel  ')).toBeNull();
  });

  it('says nothing about a genuinely new garment', () => {
    expect(findSimilarGarment(LIST, 'Agbada')).toBeNull();
    expect(findSimilarGarment(LIST, 'Curtain')).toBeNull();
  });

  it('does not match on a stray letter or a filler word', () => {
    // A one-letter token identifies nothing; matching on one is how a question
    // about the shop once resolved to a bottle of soft drink.
    expect(garmentWords('Shirt with Emma')).toEqual(['shirt', 'emma']);
    expect(findSimilarGarment(['S'], 'Shirt with Emma')).toBeNull();
    expect(findSimilarGarment(['With'], 'Shirt with Emma')).toBeNull();
  });

  it('prefers the closest of several possible matches', () => {
    const list = ['Shirt', 'Shirt Long Sleeve'];
    expect(findSimilarGarment(list, 'Shirt Long Sleeve for Emma')).toBe('Shirt Long Sleeve');
  });

  it('handles an empty or meaningless entry', () => {
    expect(findSimilarGarment(LIST, '')).toBeNull();
    expect(findSimilarGarment(LIST, '   ')).toBeNull();
    expect(findSimilarGarment(LIST, '!!')).toBeNull();
  });
});
