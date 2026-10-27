import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menhOf, affinity, suggestedAccent, normalizeAccent, ACCENTS, elementOfAccent } from '../../public/js/domain/fengshui.js';

test('Can Chi and nạp âm element for known years', () => {
  // Reference values from the standard 60-year nạp âm table.
  const cases = {
    1984: ['Giáp Tý', 'kim'], // Hải Trung Kim
    1986: ['Bính Dần', 'hoa'], // Lư Trung Hỏa
    1988: ['Mậu Thìn', 'moc'], // Đại Lâm Mộc
    1990: ['Canh Ngọ', 'tho'], // Lộ Bàng Thổ
    1992: ['Nhâm Thân', 'kim'], // Kiếm Phong Kim
    1996: ['Bính Tý', 'thuy'], // Giản Hạ Thủy
    2000: ['Canh Thìn', 'kim'], // Bạch Lạp Kim
    2020: ['Canh Tý', 'tho'], // Bích Thượng Thổ
    2022: ['Nhâm Dần', 'kim'], // Kim Bạch Kim
    1975: ['Ất Mão', 'thuy'], // Đại Khê Thủy
    1971: ['Tân Hợi', 'kim'], // Thoa Xuyến Kim
  };
  for (const [y, [cc, el]] of Object.entries(cases)) {
    assert.deepEqual(menhOf(Number(y)), { canChi: cc, element: el }, y);
  }
  assert.equal(menhOf(1800), null);
  assert.equal(menhOf(1990.5), null);
});

test('affinity follows tương sinh / tương khắc', () => {
  assert.equal(affinity('tho', 'hoa'), 'sinh'); // Hỏa sinh Thổ
  assert.equal(affinity('tho', 'tho'), 'hop');
  assert.equal(affinity('tho', 'moc'), 'khac'); // Mộc khắc Thổ
  assert.equal(affinity('tho', 'kim'), 'neutral');
  assert.equal(affinity('kim', 'tho'), 'sinh');
  assert.equal(affinity('kim', 'hoa'), 'khac');
  assert.equal(affinity(null, 'kim'), 'neutral');
});

test('suggested accent and legacy ids', () => {
  assert.equal(elementOfAccent(suggestedAccent(1990)), 'hoa');
  assert.equal(elementOfAccent(suggestedAccent(1984)), 'tho');
  assert.equal(normalizeAccent('amber'), 'tho-ochre');
  assert.equal(normalizeAccent('nope'), 'terracotta');
  assert.equal(ACCENTS.length, 11);
  for (const a of ACCENTS) assert.equal(normalizeAccent(a), a);
});
