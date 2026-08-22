import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEcommerceProjectListPreferenceKey,
  readEcommerceProjectListCollapsed,
  writeEcommerceProjectListCollapsed
} from '../shared/ecommerce-ui-preferences.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test('ecommerce project-list preference defaults to collapsed', () => {
  assert.equal(readEcommerceProjectListCollapsed('user-a', createStorage()), true);
});

test('ecommerce project-list preference restores the latest state per user', () => {
  const storage = createStorage();

  writeEcommerceProjectListCollapsed(false, 'user-a', storage);
  writeEcommerceProjectListCollapsed(true, 'user-b', storage);

  assert.equal(readEcommerceProjectListCollapsed('user-a', storage), false);
  assert.equal(readEcommerceProjectListCollapsed('user-b', storage), true);
  assert.notEqual(
    getEcommerceProjectListPreferenceKey('user-a'),
    getEcommerceProjectListPreferenceKey('user-b')
  );
});

test('ecommerce project-list preference tolerates unavailable storage', () => {
  const unavailableStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    }
  };

  assert.equal(readEcommerceProjectListCollapsed('user-a', unavailableStorage), true);
  assert.doesNotThrow(() => writeEcommerceProjectListCollapsed(false, 'user-a', unavailableStorage));
});
