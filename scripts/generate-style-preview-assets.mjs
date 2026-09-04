import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import sharp from 'sharp';

import { getImageProviderConfig } from '../api/_lib/local-db.js';
import { generateImage, isProviderConfigured } from '../api/_lib/provider.js';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'data', 'images', 'style-presets', 'generated');
const reportPath = path.join(root, 'output', 'style-preview-audit', 'generation-report.json');
const requestedIds = new Set(String(process.argv.find((item) => item.startsWith('--ids=')) || '').replace(/^--ids=/, '').split(',').filter(Boolean));
const force = process.argv.includes('--force');
const concurrency = Math.max(1, Math.min(4, Number(String(process.argv.find((item) => item.startsWith('--concurrency=')) || '').replace(/^--concurrency=/, '')) || 3));
const execFileAsync = promisify(execFile);

const shared = [
  'Square visual-style preset thumbnail for a professional AI image creation interface.',
  'One clear focal subject, composition readable at small size, polished lighting and materials.',
  'No words, no letters, no logos, no brand marks, no watermark, no UI, no collage border.'
].join(' ');

const specs = [
  ['surreal-photo', 'Photorealistic surreal scene: a transparent umbrella floating above a quiet stone courtyard while realistic clouds appear inside its canopy; physically believable daylight and shadows, elegant uncanny mood.'],
  ['wasteland-sci-fi', 'Cinematic post-apocalyptic science-fiction photography: a lone explorer beside a weathered solar outpost in a vast dusty desert, monumental scale, realistic rust and fabric, atmospheric haze.'],
  ['macaron-photo', 'Bright photorealistic still life of rounded ceramic vessels, macarons, and small flowers in mint, peach, lavender, and cream; airy diffused daylight, clean premium composition.'],
  ['ricoh-street-color', 'Candid compact-camera street photograph of an adult cyclist crossing a sunlit neighborhood intersection, crisp micro-contrast, natural urban colors, subtle grain, spontaneous framing.'],
  ['luxury-product', 'Luxury commercial product photograph of an unbranded faceted perfume bottle on a dark stone pedestal, sculpted highlights, refined reflections, deep elegant background, generous negative space.'],
  ['fresh-food-ad', 'Fresh commercial beverage photograph of a clear unbranded citrus drink with condensation, sliced orange and mint, bright daylight, appetizing color, clean energetic composition.'],
  ['packaging-display', 'Professional packaging presentation of an original unbranded skincare bottle beside its matching folding carton, accurate box structure, clean three-quarter view, controlled studio light, no printed text.'],
  ['studio-portrait', 'Professional studio portrait of an adult East Asian creative director, waist-up, neutral gray seamless background, controlled soft key light and rim light, realistic skin texture, confident calm pose.'],
  ['fashion-editorial', 'High-fashion editorial portrait of an adult model wearing a fully covered sculptural cobalt coat, deliberate pose, graphic studio composition, refined magazine lighting, no logos.'],
  ['soft-glow-portrait', 'Luminous portrait of an adult ceramic artist in a modest cream shirt, diffused window light, delicate highlights, airy neutral palette, realistic skin texture, quiet dreamy mood.'],
  ['street-fashion', 'Urban street-fashion editorial of an adult model in a layered olive jacket and wide-leg trousers, walking through a modern city, natural overcast light, documentary energy, no logos.'],
  ['storybook', 'Warm storybook illustration of a small fox delivering a lantern to a woodland cottage at dusk, expressive hand-drawn detail, inviting colors, tactile paper texture, clear narrative moment.'],
  ['retro-comic', 'Original 1950s comic-book action illustration of a masked bicycle courier leaping between rooftops, thick ink outlines, limited vintage print palette, halftone dots, dynamic diagonal composition.'],
  ['single-line-art', 'Elegant continuous single-line drawing of a seated cat beside one flower vase, black ink on warm off-white paper, one flowing contour, abundant intentional negative space.'],
  ['design-sketch', 'Professional product concept sketch sheet for an original compact desk lamp, multiple perspective explorations, construction lines, material swatches, proportion callouts represented by abstract marks, disciplined layout.'],
  ['chibi-anime', 'Original chibi anime pastry chef holding a loaf of bread, oversized expressive head, compact cute proportions, clean linework, bright controlled cel shading, simple pastel backdrop.'],
  ['xianxia-fantasy', 'Original cinematic xianxia fantasy scene: an adult traveler in layered teal robes standing on a stone bridge above cloud-filled mountains, elegant architecture, luminous mist, poetic eastern adventure.'],
  ['game-cg', 'Original premium game cinematic CG scene of an armored desert ranger entering an ancient mechanical gate, detailed materials, dramatic production lighting, strong silhouette, coherent action staging.'],
  ['warm-handdrawn-animation', 'Warm hand-drawn animated-film scene of a child riding a bicycle through a lush hillside village, organic linework, softly painted natural environment, gentle sunlight, quiet everyday wonder.'],
  ['retro-american-comic', 'Original golden-age American comic illustration of a red-jacket mechanic repairing a friendly robot, bold black outlines, limited cyan red and cream palette, coarse halftone print texture.'],
  ['spoof-american-comic', 'Humorous American comic panel: an astonished adult office worker chasing a runaway coffee cup, highly exaggerated expression and motion, bold inks, energetic speech-free composition, halftone color.'],
  ['classic-chinese-animation', 'Classic Chinese animation aesthetic: an elegant white crane flying above misty layered mountains and pine trees, traditional mineral colors, hand-painted cel texture, restrained poetic composition.'],
  ['american-animation', 'Original modern American animation scene of an adventurous red squirrel balancing on a city rooftop, expressive pose, strong clean silhouette, vivid color blocks, polished animated lighting.'],
  ['detective-anime', 'Original Japanese detective anime scene: an adult investigator in a light trench coat studies a clear red thread evidence board inside a warmly lit office, readable face and pose, dramatic framing, refined cel shading.'],
  ['rainbow-pony-animation', 'Original cute pastel pony character galloping through a rainbow cloud meadow, rounded friendly design, vivid candy colors, clean animation linework, joyful fantasy atmosphere.'],
  ['superhero-girl-animation', 'Original animated adult heroine standing on a rooftop at sunrise, fully covered teal, white, and gold rescue suit with no cape and no symbols, strong graphic silhouette, confident action pose, bright optimistic colors.'],
  ['soft-c4d', 'Friendly stylized 3D scene of a round cloud-shaped desk lamp and tiny smiling plant pot, soft tactile materials, pastel palette, gentle studio lighting, clean shadows.'],
  ['collectible-figure', 'Premium original vinyl collectible astronaut figure displayed on a small museum pedestal, carefully molded details, matte and glossy toy materials, soft studio lighting, clean backdrop.'],
  ['plush-material', 'Close-up product-style render of an original soft plush bear, dense short fur fibers, rounded comforting shape, visible stitching, warm neutral studio background.'],
  ['cotton-doll', 'Original handmade cotton doll wearing a tiny green coat, clearly sewn cloth construction, embroidered face, soft stuffed proportions, clean tabletop product presentation.'],
  ['healing-plush-doll', 'Original whimsical long-eared plush creature sitting beside a tiny cup, velvety fabric, gently imperfect handmade shape, warm cozy room, comforting companion mood.'],
  ['isometric-3d', 'Isometric 3D miniature creative studio room, cutaway view with desk, lamp, shelves, camera, and plants, clear spatial organization, soft shadows, tidy colorful materials.'],
  ['chinese-3d-animation', 'Original cinematic Chinese 3D animation character: adult swordswoman in a bamboo courtyard, refined East Asian costume, detailed hair and fabric simulation, dramatic film lighting.'],
  ['glass-material', 'Premium translucent glass sculpture shaped like a curling ocean wave, physically believable refraction and caustics, crisp highlights, pale cyan color, clean studio pedestal.'],
  ['cartoon-c4d', 'Polished cartoon C4D render of an original tiny delivery scooter with rounded proportions and colorful parcels, candy-color materials, soft global illumination, clean playful composition.'],
  ['cg-render', 'High-end cinematic CG render of an original futuristic observatory in a rocky landscape, detailed geometry and materials, physically coherent lighting, atmospheric depth.'],
  ['polaroid-3d', 'Creative 3D instant-photo composition: an original red sailboat and curling ocean wave emerge beyond a blank white instant-photo frame, convincing overlap and shadows, no text.'],
  ['wool-felt', 'Handcrafted wool-felt miniature of a small red fox beside a pine tree, clearly visible soft fibers, needle-felted construction, warm tabletop lighting, tactile detail.'],
  ['ice-cream-material', 'Whimsical miniature cottage sculpted entirely from gelato and soft-serve ice cream, creamy swirls, melting edges, pastel fruit colors, appetizing studio lighting.'],
  ['iridescent-pvc', 'Futuristic translucent PVC mini pouch with softly rounded shape, iridescent cyan-magenta gradient, realistic flexible plastic seams and refraction, clean studio pedestal.'],
  ['plaster-sculpture', 'White plaster classical bust on a simple pedestal, crisp carved facial detail, dry matte chalk texture, soft museum side lighting, neutral gray background.'],
  ['logo-design', 'Original minimal geometric logo symbol combining a leaf and a camera aperture, flat deep green on warm white, strong silhouette, balanced negative space, centered mark only.'],
  ['red-envelope-cover', 'Elegant vertical Chinese red-envelope cover design with an original gold koi and flowing cloud motif, rich red paper texture, refined foil accents, festive but uncluttered, no text.'],
  ['dunhuang', 'Dunhuang-inspired mural painting of an original celestial dancer floating among ribbon clouds, mineral blue green ochre and vermilion pigments, aged cave-wall texture, graceful historic composition.'],
  ['neo-chinese', 'Contemporary neo-Chinese interior still life: sculptural tea vessel, circular ink-inspired screen, pale stone and dark wood, modern asymmetrical composition, restrained jade and charcoal palette.'],
  ['impressionist-garden', 'Impressionist garden painting of a sunlit lily pond with a small arched bridge and flowering shrubs, broken color, luminous atmosphere, visible lively brushstrokes, no frame.'],
  ['pocket-box', 'An open pocket-sized presentation box containing a complete tiny bakery interior, miniature shelves and pastries, precise scale illusion, warm lights, charming handcrafted 3D detail.'],
  ['city-capsule', 'A complete futuristic coastal city enclosed inside one transparent glass capsule, tiny towers and transit lines, believable refraction and condensation, clean studio background.'],
  ['voxel-world', 'Original voxel-art forest village built from crisp cubic blocks, tiny river, bridge, trees, and houses, isometric game-world view, coherent lighting, no interface elements.'],
  ['building-blocks', 'Original modular toy building-block city with colorful interlocking bricks, small vehicles and trees, clean tabletop view, realistic plastic studs, no recognizable brand.'],
  ['sticker-pack', 'A cohesive pack of nine original expressive cat stickers arranged in a clean three-by-three grid, bold white die-cut outlines, distinct emotions and poses, colorful flat illustration.'],
  ['pastel-doll-fashion', 'Original stylized 3D fashion figurine with clearly toy-like proportions, adult-coded character in a fully covered lavender couture suit, glossy pastel accessories without logos, polished pink display set.'],
  ['future-sci-fi', 'Clean optimistic future science-fiction city with white modular architecture, elevated transit, green terraces, solar surfaces, bright blue daylight, believable cinematic scale.'],
  ['natural-photo', 'Natural documentary photograph of an adult florist arranging wildflowers beside a sunlit window, realistic skin and materials, soft daylight, restrained color, candid believable moment.'],
  ['cinematic-photo', 'Cinematic photograph of an adult traveler waiting alone beneath a rain shelter at blue hour, motivated practical light, layered depth, reflective pavement, subtle film color grading.'],
  ['vintage-film', 'Authentic 1970s-style analog photograph of an adult couple beside a small roadside camper, warm faded colors, gentle grain, soft highlight roll-off, natural imperfections.'],
  ['ccd-snapshot', 'Casual compact CCD snapshot of adult friends at a late-night noodle shop, direct on-camera flash, authentic grain, spontaneous framing, lively everyday atmosphere.'],
  ['teal-orange-cinema', 'Cinematic teal-and-orange night photograph of an adult courier beside a wet city street, practical amber lights, cool shadows, dimensional depth, realistic materials.'],
  ['dreamcore-photo', 'Dreamcore photograph of an empty indoor swimming pool opening into a cloudy sky, familiar architecture rendered subtly uncanny, hazy glow, nostalgic pastel color.'],
  ['clean-product', 'Clean catalog photograph of an original unbranded sage-green wireless speaker, fully visible and centered on a warm off-white seamless background, crisp silhouette, accurate matte material, controlled softbox light.'],
  ['tech-commercial', 'Modern technology advertisement of an original unbranded transparent smart device with visible internal layers, precise geometry, cool controlled light, clean gradients, dark studio backdrop.'],
  ['miniature-product', 'Creative miniature product advertisement for an unbranded travel mug, tiny hikers and a miniature trail arranged around the product, believable scale, clear product dominance.'],
  ['lifestyle-portrait', 'Natural lifestyle portrait of an adult baker laughing while preparing bread in a lived-in kitchen, candid gesture, soft available light, warm human feeling, restrained polish.'],
  ['flash-portrait', 'Bold direct-flash fashion portrait of an adult musician against a simple cobalt wall, crisp subject separation, confident pose, punchy accurate color, editorial spontaneity.'],
  ['watercolor', 'Elegant watercolor illustration of a quiet riverside bookstore with bicycles and flowering trees, translucent washes, natural pigment blooms, visible cold-press paper, balanced white space.'],
  ['flat-illustration', 'Contemporary flat illustration of people collaborating around a large community garden map, simplified geometric shapes, clear silhouettes, confident color blocks, minimal shading.'],
  ['anime', 'Original animation-inspired scene of an adult astronomer on a rooftop observatory at twilight, clean expressive linework, polished cel shading, cinematic color and detailed sky.'],
  ['colored-pencil', 'Detailed colored-pencil illustration of a red fox curled among autumn leaves, visible layered pencil strokes, warm textured paper, gentle blending, precise handcrafted edges.'],
  ['comic-storyboard', 'Original six-panel comic storyboard showing an adult bicycle messenger finding and returning a lost package, clear continuity, varied camera framing, readable action, no text balloons.'],
  ['oil-impasto', 'Expressive oil impasto painting of a windswept coastal lighthouse at sunset, thick dimensional brushstrokes, rich pigment mixing, tactile canvas, confident light and shadow.'],
  ['pencil-sketch', 'Professional graphite pencil sketch of an old mechanical camera on a desk, precise construction lines, nuanced cross-hatching, realistic tonal values, textured drawing paper.'],
  ['graffiti-art', 'Original graffiti mural of a giant hummingbird flying through abstract city flowers, expressive spray-paint gestures, layered marker lines, bold rhythm, controlled neon accents.'],
  ['childlike-illustration', 'Warm childlike illustration of three children building a cardboard rocket in a living room, charming simplified forms, playful imperfections, friendly color harmony, clear storytelling.'],
  ['realistic-anime', 'Original realistic-anime cinematic frame of an adult train conductor standing on a snowy rural platform, refined character design, believable environment, subtle cel-rendered surfaces.'],
  ['live-action-illustration', 'Photoreal city café exterior with an original hand-drawn blue bird character delivering a tiny letter, consistent perspective and shadow, seamless real-scene integration.'],
  ['japanese-anime', 'Original polished Japanese animation scene of an adult violin maker working beside a window, refined expressive linework, clean cel shading, detailed painted workshop background.'],
  ['healing-anime', 'Comforting slice-of-life anime scene of adult friends sharing tea beside a sunny window with a sleeping cat, gentle interaction, warm natural light, calm harmonious colors.'],
  ['miniature-world', 'Intricate miniature diorama of a mountain railway village, tiny station, bridge, homes, people, and trees, tilt-shift depth, tactile handcrafted materials.'],
  ['paper-sculpture', 'Layered paper-sculpture artwork of a whale swimming through curling ocean waves, precisely cut paper edges, visible fibers, dimensional shadows, clean handcrafted construction.'],
  ['metallic-material', 'High-end metallic material study of an original abstract folded ribbon sculpture, brushed titanium and polished chrome surfaces, precise reflections, dramatic clean studio light.'],
  ['knitted-material', 'Original knitted toy dachshund wearing a striped scarf, clearly visible yarn loops and stitches, soft dimensional construction, warm handcrafted tabletop scene.'],
  ['editorial-poster', 'Contemporary editorial poster composition for an imaginary architecture exhibition, one geometric building image, disciplined grid, bold shape hierarchy, generous negative space, no readable text.'],
  ['retro-poster', 'Original 1960s-inspired travel poster of a mountain cable car, limited orange teal and cream palette, bold simplified shapes, subtle halftone and aged paper texture, no text.'],
  ['brand-key-visual', 'Campaign-ready key visual for an original unbranded sparkling water can, memorable circular splash concept, clear product focus, distinctive turquoise color system, premium advertising composition.'],
  ['infographic', 'Modern visual infographic explaining a four-stage urban rainwater cycle using clean icons, pipes, arrows, and grouped diagrams, restrained blue-green palette, no readable text.'],
  ['scrapbook-poster', 'Contemporary scrapbook poster about a coastal road trip, layered original photos, torn paper, tape, map fragments, playful editorial rhythm, cohesive blue and coral palette, no readable text.'],
  ['typography-poster', 'Typography-led abstract poster using invented non-readable geometric letterforms, dramatic scale contrast, disciplined grid, black cream and red palette, strong graphic tension.'],
  ['ink-wash', 'Contemporary Chinese ink-wash landscape of a lone pavilion beside misty mountains, expressive ink diffusion, elegant negative space, restrained pale mineral-blue accent, rice-paper texture.'],
  ['meticulous-painting', 'Chinese meticulous painting of two kingfishers among lotus flowers, precise fine-line drawing, elegant layered mineral colors, refined feather and botanical detail, balanced classical composition.'],
  ['guochao-poster', 'Original contemporary guochao poster composition with a red-crowned crane, stylized sun, waves, and cloud motifs, bold modern geometry, rich controlled red blue and gold, no text.'],
  ['oriental-fantasy', 'Elegant oriental fantasy scene of a luminous white stag crossing a moonlit stone bridge above clouded mountains, poetic depth, refined Chinese-inspired motifs, cinematic mist.'],
  ['modern-ink-color', 'Modern Chinese ink-and-color painting of white village walls beside a river, rhythmic black lines, abstract architectural forms, lively red and yellow color dots, generous white space.'],
  ['pixel-art', 'High-quality 16-bit pixel-art night market with tiny food stalls, lanterns, pedestrians, and wet reflections, crisp silhouettes, controlled limited palette, readable lighting clusters.'],
  ['colorful-fantasy', 'Colorful fantasy scene of a luminous koi swimming through a sky filled with floating islands and rainbow clouds, layered atmosphere, balanced saturation, polished magical detail.'],
  ['steampunk', 'Detailed steampunk airship workshop with an adult engineer beside functional brass gears, copper pipes, pressure gauges, and a half-built flying machine, warm dramatic light.'],
  ['festival-spring-new-year', 'Photoreal premium Lunar New Year campaign scene: a refined red lacquer table with elegant unbranded gift boxes, warm glowing Chinese lanterns, delicate paper-cut shadows, subtle golden fireworks bokeh, rich red and gold palette, realistic materials, festive but uncluttered.'],
  ['festival-lantern', 'Photoreal Lantern Festival night scene in a traditional riverside lane, handcrafted glowing lanterns reflected on wet stone, a small porcelain bowl of tangyuan in the foreground, warm cinematic light, elegant festive depth, no text.'],
  ['festival-qingming', 'Photoreal poetic Qingming spring landscape: fresh willow branches beside a misty river, fine rain, pale green hills, a simple stone path, soft overcast daylight, restrained Chinese editorial mood, quiet and refined.'],
  ['festival-dragon-boat', 'Photoreal Dragon Boat Festival scene: a racing dragon boat cutting through green-blue water, dynamic spray, bamboo leaves and a neatly wrapped zongzi in the foreground, energetic sunlight, premium advertising composition.'],
  ['festival-520', 'Photoreal modern 520 romance campaign: a sculptural blush gift box with satin ribbon, fresh roses, translucent heart-shaped glass accents, soft pink-to-burgundy gradient set, luminous luxury product lighting, no words.'],
  ['festival-qixi', 'Photoreal poetic Qixi night scene: an elegant couple seen as small adult silhouettes on a graceful bridge beneath a luminous star river, indigo sky, rose-gold lantern light, subtle oriental clouds, cinematic romantic atmosphere.'],
  ['festival-mid-autumn', 'Photoreal Mid-Autumn still life: an elegant unbranded mooncake gift arrangement, porcelain tea set, fresh osmanthus branches, large luminous full moon beyond a courtyard window, blue and warm gold night lighting, premium commercial finish.'],
  ['festival-national-day', 'Photoreal celebratory city scene at golden hour with flowing red silk ribbons, warm architectural lights, subtle golden sparkles, clean civic skyline, energetic red-and-gold campaign composition, no flags with text and no portraits.'],
  ['festival-new-year', 'Photoreal stylish New Year countdown party scene: champagne glasses, metallic confetti, layered fireworks above a modern skyline, midnight blue and warm gold palette, crisp premium event photography, no readable numerals.'],
  ['festival-childrens-day', 'Photoreal cheerful family playroom celebration still life with colorful balloons, wooden building blocks, paper pinwheels and a small canvas play tent, bright natural daylight, playful premium campaign styling, no people and no brand characters.'],
  ['festival-valentine', 'Photoreal luxury Valentine’s Day still life: deep red roses, sculptural heart-shaped glass object, velvet gift box and warm candle bokeh on dark burgundy, refined romantic product photography, no text or logos.'],
  ['festival-mothers-day', 'Photoreal Mother’s Day floral gifting scene: graceful carnation and peony bouquet, cream gift box, handwritten blank card, soft morning window light, blush and ivory palette, warm elegant commercial photography.'],
  ['festival-fathers-day', 'Photoreal Father’s Day premium gifting still life: an unbranded leather wallet, classic watch, folded navy fabric and warm wood surface, controlled side light, deep navy and cognac palette, refined and dependable mood.'],
  ['festival-easter', 'Photoreal Easter spring tabletop scene with naturally dyed decorated eggs in a woven basket, fresh grass, small white flowers and soft morning sunlight, airy pastel palette, clean editorial photography, no text.'],
  ['festival-halloween', 'Photoreal playful Halloween scene: beautifully carved pumpkins, subtle friendly ghost-shaped fabric decorations, candles, autumn leaves and violet moonlight, orange-and-purple cinematic palette, atmospheric but suitable for all ages.'],
  ['festival-thanksgiving', 'Photoreal Thanksgiving harvest table with roasted pumpkin, wheat, pears, amber leaves, ceramic plates and warm late-afternoon light, abundant yet organized rustic styling, inviting family celebration mood.'],
  ['festival-christmas', 'Photoreal premium Christmas gift scene beneath an evergreen tree, soft snow outside the window, warm string-light bokeh, elegant red green and gold wrapping, realistic pine needles and velvet ribbon, cozy cinematic lighting.'],
  ['festival-black-friday', 'Photoreal high-impact Black Friday retail campaign set: matte black shopping bags and unbranded product boxes on glossy dark podiums, sharp red neon light, dramatic spotlights, energetic sale atmosphere, no text or price labels.'],
  ['festival-wedding', 'Photoreal elegant wedding detail scene: intertwined rings on ivory silk, white flowers, crystal glass and soft champagne highlights, bright ceremonial window light, timeless luxury editorial photography, no names or text.'],
  ['festival-birthday', 'Photoreal refined birthday party scene with a beautifully decorated cake, glowing candles, balloons, ribbons and warm party-light bokeh, lively balanced colors, premium celebration photography, no age numerals or text.']
].map(([id, request]) => ({ id, prompt: `${shared} ${request}` }));

const selected = requestedIds.size ? specs.filter((item) => requestedIds.has(item.id)) : specs;
const providerConfig = getImageProviderConfig();
if (!isProviderConfigured(providerConfig)) throw new Error('IMAGE_PROVIDER_NOT_CONFIGURED');
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });

const priorReport = await fs.readFile(reportPath, 'utf8').then(JSON.parse).catch(() => []);
const reportById = new Map(priorReport.map((item) => [item.id, item]));

async function imageBuffer(value) {
  const rawSource = value?.url || value?.image_url?.url || value?.image_url || value;
  const source = String(rawSource || '');
  const match = source.match(/^data:([^;,]+);base64,(.+)$/s);
  if (match) return Buffer.from(match[2], 'base64');
  const resolvedSource = /^https?:\/\//i.test(source)
    ? source
    : new URL(source, `${providerConfig.baseUrl.replace(/\/+$/, '')}/`).toString();
  const safeSource = (() => {
    try {
      const parsed = new URL(resolvedSource);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return 'invalid-image-url';
    }
  })();
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(resolvedSource, {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.1',
          'User-Agent': 'Pic365-StylePreview-Audit/1.0'
        }
      });
      if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  const temporaryPath = path.join(outputDir, `.download-${randomUUID()}.tmp`);
  try {
    await execFileAsync('curl.exe', [
      '--location',
      '--fail',
      '--silent',
      '--show-error',
      '--retry', '5',
      '--retry-all-errors',
      '--connect-timeout', '20',
      '--max-time', '180',
      '--user-agent', 'Pic365-StylePreview-Audit/1.0',
      '--output', temporaryPath,
      resolvedSource
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });
    return await fs.readFile(temporaryPath);
  } catch (error) {
    lastError = error;
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
  const error = new Error(`IMAGE_DOWNLOAD_FAILED ${safeSource}`);
  error.cause = lastError;
  throw error;
}

async function generateOne(spec) {
  const targetPath = path.join(outputDir, `${spec.id}.webp`);
  if (!force) {
    try {
      await fs.access(targetPath);
      return { id: spec.id, status: 'skipped', output: targetPath, prompt: spec.prompt };
    } catch {
      // Generate missing output.
    }
  }
  console.log(`[start] ${spec.id}`);
  try {
    const result = await generateImage({
      prompt: spec.prompt,
      size: '1024x1024',
      quality: 'low',
      format: 'png',
      providerConfig
    });
    const buffer = await imageBuffer(result.image);
    await sharp(buffer)
      .resize(512, 512, { fit: 'cover', position: 'attention' })
      .webp({ quality: 78, effort: 5 })
      .toFile(targetPath);
    console.log(`[done] ${spec.id}`);
    return { id: spec.id, status: 'generated', output: targetPath, prompt: spec.prompt, providerRequestId: result.providerRequestId || '' };
  } catch (error) {
    const errorText = [error?.code, error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean).join(' | ') || String(error);
    console.error(`[failed] ${spec.id}: ${errorText}`);
    return { id: spec.id, status: 'failed', error: errorText, prompt: spec.prompt };
  }
}

let cursor = 0;
async function worker() {
  while (cursor < selected.length) {
    const spec = selected[cursor];
    cursor += 1;
    const result = await generateOne(spec);
    reportById.set(spec.id, result);
    await fs.writeFile(reportPath, `${JSON.stringify([...reportById.values()], null, 2)}\n`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
const results = selected.map((item) => reportById.get(item.id));
console.log(JSON.stringify({ total: results.length, generated: results.filter((item) => item?.status === 'generated').length, skipped: results.filter((item) => item?.status === 'skipped').length, failed: results.filter((item) => item?.status === 'failed').map((item) => item.id) }));
