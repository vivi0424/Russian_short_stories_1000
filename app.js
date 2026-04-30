let stories = [];
let filteredStories = [];
let network = null;
let currentStory = null;

const selectEl = document.getElementById('storySelect');
const searchEl = document.getElementById('storySearch');
const sortEl = document.getElementById('storySort');
const titleEl = document.getElementById('storyTitle');
const metaEl = document.getElementById('storyMeta');
const characterListEl = document.getElementById('characterList');
const detailPanelEl = document.getElementById('detailPanel');
const container = document.getElementById('mynetwork');

const helpBtn = document.getElementById('helpBtn');
const aboutTab = document.getElementById('aboutTab');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');

helpBtn.addEventListener('click', () => modal.classList.remove('hidden'));
aboutTab.addEventListener('click', () => modal.classList.remove('hidden'));
closeModal.addEventListener('click', () => modal.classList.add('hidden'));

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});

fetch('stories_index.json')
  .then(r => r.json())
  .then(data => {
    stories = data;
    filteredStories = data;
    init();
  });

function init() {
  selectEl.addEventListener('change', async () => {
    const storyInfo = stories.find(s => s.id === selectEl.value);

    if (storyInfo) {
      const story = await loadStory(storyInfo);
      renderStory(story);
    }
  });

  searchEl.addEventListener('input', () => {
    updateStoryList();
  });

  sortEl.addEventListener('change', () => {
    updateStoryList();
  });

  updateStoryList();
}

function updateStoryList() {
  const query = normalizeText(searchEl.value);

  filteredStories = stories.filter(story => {
    const haystack = normalizeText(
      `${story.id} ${story.title} ${story.author} ${story.year}`
    );

    return haystack.includes(query);
  });

  filteredStories = sortStories(filteredStories, sortEl.value);

  renderStoryOptions(filteredStories);

  if (filteredStories.length) {
    selectEl.value = filteredStories[0].id;
    loadStory(filteredStories[0]).then(renderStory);
  } else {
    clearStoryView();
  }
}

function sortStories(list, sortType) {
  return [...list].sort((a, b) => {
    if (sortType === 'year') {
      const yearA = Number(a.year) || 9999;
      const yearB = Number(b.year) || 9999;

      if (yearA !== yearB) return yearA - yearB;
      return a.title.localeCompare(b.title, 'ru');
    }

    if (sortType === 'title') {
      return a.title.localeCompare(b.title, 'ru');
    }

    if (sortType === 'author') {
      return a.author.localeCompare(b.author, 'ru');
    }

    return 0;
  });
}

function renderStoryOptions(list) {
  selectEl.innerHTML = '';

  list.forEach(story => {
    const opt = document.createElement('option');
    opt.value = story.id;
    opt.textContent = `«${story.title}» — ${story.author}`;
    selectEl.appendChild(opt);
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .trim();
}

async function loadStory(storyInfo) {
  const response = await fetch(storyInfo.file);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить файл рассказа: ${storyInfo.file}`);
  }

  return await response.json();
}

function clearStoryView() {
  titleEl.textContent = 'Ничего не найдено';
  metaEl.textContent = 'Попробуйте изменить поисковый запрос.';
  characterListEl.innerHTML = '';
  detailPanelEl.innerHTML = 'Нажмите на персонажа или ребро графа.';

  if (network) {
    network.destroy();
    network = null;
  }
}

function renderStory(story) {
  currentStory = story;

  titleEl.textContent = story.title;
  metaEl.textContent = `${story.author} · ${story.year ?? '—'} · ${story.nodes.length} персонажей`;

  renderCharacterList(story);
  renderGraph(story);

  detailPanelEl.innerHTML = 'Нажмите на персонажа или ребро графа.';
}

function renderCharacterList(story) {
  characterListEl.innerHTML = '';

  const sorted = [...story.nodes].sort((a, b) => {
    if (a.main !== b.main) return a.main ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  sorted.forEach(node => {
    const btn = document.createElement('button');
    btn.className = 'character-item';
    btn.textContent = node.name;
    btn.addEventListener('click', () => showNodeDetails(node));
    characterListEl.appendChild(btn);
  });
}

function renderGraph(story) {
  if (network) {
    network.destroy();
    network = null;
  }

  const degreeMap = new Map();

  story.nodes.forEach(n => degreeMap.set(n.id, 0));

  story.links.forEach(l => {
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
  });

  const nodes = new vis.DataSet(
    story.nodes.map(n => ({
      id: n.id,
      label: n.name,
      value: Math.max(1, degreeMap.get(n.id) || 1),
      group: n.main ? 'main' : 'secondary',
      title: n.name
    }))
  );

  const edges = new vis.DataSet(
    story.links.map(l => {
      const types = Array.isArray(l.types) ? l.types : [];
      const hasKinship = types.includes('kinship_social') || types.includes('kinship');
      const kinshipOnly = types.length === 1 && hasKinship;

      const graphWeight = Number(l.weight) || 0.1;
      const intensity = l.intensity ?? '—';

      return {
        id: `${l.source}__${l.target}`,
        from: l.source,
        to: l.target,
        value: graphWeight,
        width: kinshipOnly ? 1.5 : 1 + graphWeight * 8,
        dashes: kinshipOnly,
        color: hasKinship ? '#e78ac3' : '#4da3ff',
        title: `Типы: ${types.join(', ')}
Эпизодов: ${l.episode_count ?? '—'}
Интенсивность: ${intensity}
Вес на графе: ${graphWeight}`
      };
    })
  );

  const data = { nodes, edges };

  const options = {
    physics: {
      stabilization: true,
      barnesHut: {
        gravitationalConstant: -4200,
        springLength: 130,
        springConstant: 0.03
      }
    },
    nodes: {
      shape: 'dot',
      scaling: {
        min: 8,
        max: 18
      },
      font: {
        color: 'black',
        size: 16,
        face: 'Arial'
      }
    },
    groups: {
      main: {
        color: {
          background: '#7ea6d8',
          border: '#5e84b8',
          highlight: {
            background: '#7ea6d8',
            border: '#5e84b8'
          }
        }
      },
      secondary: {
        color: {
          background: '#9ec9ff',
          border: '#4da3ff',
          highlight: {
            background: '#9ec9ff',
            border: '#4da3ff'
          }
        }
      }
    },
    edges: {
      smooth: true,
      arrows: {
        to: false
      },
      color: {
        inherit: false
      }
    },
    interaction: {
      hover: true
    }
  };

  network = new vis.Network(container, data, options);

  network.on('click', params => {
    if (params.nodes.length) {
      const node = story.nodes.find(n => n.id === params.nodes[0]);

      if (node) showNodeDetails(node);
      return;
    }

    if (params.edges.length) {
      const rawEdge = story.links.find(l => `${l.source}__${l.target}` === params.edges[0]);

      if (rawEdge) showEdgeDetails(rawEdge, story);
    }
  });
}

function showNodeDetails(node) {
  detailPanelEl.innerHTML = `
    <h4>Информация о персонаже</h4>
    <p class="kv"><strong>Персонаж:</strong> ${escapeHtml(node.name)}</p>
    <p class="kv"><strong>Полное имя:</strong> ${escapeHtml(node.full_name || '—')}</p>
    <p class="kv"><strong>Статус:</strong> ${node.main ? 'главный' : 'второстепенный / эпизодический'}</p>
    <p class="kv"><strong>Кто он:</strong> ${escapeHtml(node.who || '—')}</p>
    <p class="kv"><strong>Варианты наименований:</strong> ${escapeHtml(node.aliases || '—')}</p>
    <p class="kv"><strong>Характеристика автора:</strong> ${escapeHtml(node.author_characterization || '—')}</p>
    <p class="kv"><strong>Пол:</strong> ${escapeHtml(node.gender || '—')}</p>
    <p class="kv"><strong>Возраст:</strong> ${escapeHtml(node.age || '—')}</p>
    <p class="kv"><strong>Прочее:</strong> ${escapeHtml(node.other || '—')}</p>
  `;
}

function showEdgeDetails(edge, story) {
  const source = story.nodes.find(n => n.id === edge.source);
  const target = story.nodes.find(n => n.id === edge.target);

  const evidenceBlock = edge.evidence && edge.evidence.length
    ? edge.evidence.map(e => `<li>${escapeHtml(e)}</li>`).join('')
    : '<li>—</li>';

  detailPanelEl.innerHTML = `
    <h4>Информация о взаимодействии между персонажами</h4>
    <p class="kv"><strong>Персонаж 1:</strong> ${escapeHtml(source?.name || edge.source)}</p>
    <p class="kv"><strong>Персонаж 2:</strong> ${escapeHtml(target?.name || edge.target)}</p>
    <p class="kv"><strong>Типы связи:</strong> ${escapeHtml(edge.types.join(', '))}</p>
    <p class="kv"><strong>Количество эпизодов:</strong> ${edge.episode_count ?? '—'}</p>
    <p class="kv"><strong>Интенсивность:</strong> ${edge.intensity ?? '—'}</p>
    <p class="kv"><strong>Вес:</strong> ${edge.weight}</p>
    <p class="kv"><strong>Комментарий:</strong> ${escapeHtml(edge.notes || '—')}</p>
    <p class="kv"><strong>Пример из текста:</strong></p>
    <ul>${evidenceBlock}</ul>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}