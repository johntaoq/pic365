import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultEcommercePlan,
  getEcommercePlatform,
  getEcommerceSubcategories,
  inferEcommerceIndustryId,
  inferEcommerceSubcategoryId
} from '../shared/ecommerce-catalog.js';

test('product names are mapped to a useful hidden industry automatically', () => {
  assert.equal(inferEcommerceIndustryId('30oz 大容量吸管保温杯'), 'appliances-kitchen');
  assert.equal(inferEcommerceIndustryId('轻量户外登山帐篷'), 'sports-outdoor');
  assert.equal(inferEcommerceIndustryId('Wireless noise cancelling earbuds'), 'consumer-electronics');
  assert.equal(inferEcommerceIndustryId('Pic365 矿泉水'), 'beverage-alcohol');
  assert.equal(inferEcommerceIndustryId('未覆盖的新商品'), 'general');
});

test('automatic categories expose an editable second level', () => {
  assert.ok(getEcommerceSubcategories('beverage-alcohol').length > 1);
  assert.equal(inferEcommerceSubcategoryId('beverage-alcohol', 'Pic365 矿泉水'), 'water-soft-drinks');
  assert.equal(inferEcommerceSubcategoryId('appliances-kitchen', '30oz 大容量吸管保温杯'), 'drinkware');
});

test('new projects start with a concise recommended plan instead of every slot', () => {
  const platform = getEcommercePlatform('taobao-tmall');
  const plan = getDefaultEcommercePlan(platform.id, 'general');

  assert.ok(plan.templateId);
  assert.ok(plan.visualStyleId);
  assert.ok(plan.selectedSlotIds.length >= 4);
  assert.ok(plan.selectedSlotIds.length < platform.slots.length);
  assert.ok(platform.slots.filter((slot) => slot.required).every((slot) => plan.selectedSlotIds.includes(slot.id)));
});
