import test from 'node:test';
import assert from 'node:assert/strict';
import { studioSizeChoices } from '../src/free-image-settings-ui.js';
import { imageSizeTemplateForModel } from '../shared/image-size-templates.js';
import { parseImageSize, validateImageSizeForModel } from '../shared/image-generation.js';

for (const model of ['gpt-image-2', 'gpt-image-2.5-flare', 'gemini-3.1-flash-image', 'MAI-Image-2.6']) {
  test(`studio size presentation preserves model catalog: ${model}`, () => {
    const template = imageSizeTemplateForModel(model);
    for (const ratio of [...template.ratios, { id: 'free' }]) {
      const result = studioSizeChoices(model, ratio.id, template.sizes, template.ratios);
      for (const item of template.sizes) assert.ok(result.all.includes(item), `lost original choice: ${item}`);
      for (const size of result.all) assert.ok(validateImageSizeForModel(size, model).valid, `${model}: ${size}`);
      if (ratio.id !== 'free') {
        assert.ok(result.matching.length > 0);
        for (const size of result.matching) {
          const parsed = parseImageSize(size);
          assert.equal(parsed.width * ratio.height, parsed.height * ratio.width);
        }
      }
      assert.equal(new Set(result.all).size, result.all.length);
    }
  });
}
