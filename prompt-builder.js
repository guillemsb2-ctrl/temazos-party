// prompt-builder.js – Generates AI prompts for song-list creation

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildPromptText(genreLabel, quantity) {
  return `Genera una lista de ${quantity} canciones del género ${genreLabel} en formato exacto:
URL | AÑO | TÍTULO

Reglas:
- Solo canciones que existan en YouTube Music
- La URL debe ser de music.youtube.com/watch?v=...
- El año debe ser el año original de lanzamiento
- El título debe incluir artista: "Título - Artista"
- Separa cada campo con " | " (espacio pipe espacio)
- Una canción por línea
- No repitas canciones
- Mezcla éxitos conocidos con algunos menos mainstream

Ejemplo de formato:
https://music.youtube.com/watch?v=xxxx | 1999 | ...Baby One More Time - Britney Spears
https://music.youtube.com/watch?v=yyyy | 2003 | Seven Nation Army - The White Stripes`;
}

/**
 * Renders the AI prompt builder UI into the given container.
 * @param {HTMLElement} container
 * @param {{ genres: Record<string, { key: string, label: string, emoji: string }> }} options
 */
export function renderPromptBuilder(container, { genres }) {
  container.innerHTML = '';

  const section = document.createElement('div');
  section.className = 'prompt-builder-section';

  const genreOptions = Object.values(genres)
    .map(
      (g) =>
        `<option value="${escapeHtml(g.key)}">${escapeHtml(g.emoji)} ${escapeHtml(g.label)}</option>`,
    )
    .join('');

  section.innerHTML = `
    <div class="card">
      <span class="eyebrow">🤖 Herramienta</span>
      <h2>Generador de prompt para IA</h2>
      <p class="helper-line">Genera un prompt listo para pegar en ChatGPT u otro chatbot de IA y obtener listas de canciones.</p>

      <div class="field-block">
        <label for="prompt-genre">Género</label>
        <select id="prompt-genre" class="input">${genreOptions}</select>
      </div>

      <div class="field-block">
        <label for="prompt-quantity">Cantidad de canciones</label>
        <input id="prompt-quantity" class="input" type="number" value="50" min="10" max="200" />
      </div>

      <button id="prompt-generate-btn" class="btn secondary" type="button">Generar prompt</button>

      <div id="prompt-result" style="display:none">
        <div class="field-block">
          <label for="prompt-output">Prompt generado</label>
          <textarea id="prompt-output" class="input prompt-output" readonly rows="12"></textarea>
        </div>
        <button id="prompt-copy-btn" class="btn primary" type="button">Copiar prompt</button>
      </div>
    </div>
  `;

  container.appendChild(section);

  const genreSelect = section.querySelector('#prompt-genre');
  const quantityInput = section.querySelector('#prompt-quantity');
  const generateBtn = section.querySelector('#prompt-generate-btn');
  const resultBlock = section.querySelector('#prompt-result');
  const outputArea = section.querySelector('#prompt-output');
  const copyBtn = section.querySelector('#prompt-copy-btn');

  generateBtn.addEventListener('click', () => {
    const selectedKey = genreSelect.value;
    const genre = genres[selectedKey];
    if (!genre) return;

    const quantity = Math.min(200, Math.max(10, Number(quantityInput.value) || 50));
    quantityInput.value = quantity;

    outputArea.value = buildPromptText(genre.label, quantity);
    resultBlock.style.display = '';
  });

  copyBtn.addEventListener('click', () => {
    const text = outputArea.value;
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        window.prompt('Copia el texto manualmente:', text);
      });
    } else {
      window.prompt('Copia el texto manualmente:', text);
    }
  });
}
