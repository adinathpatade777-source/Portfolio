// script.js

// Replace the links with your real videos (YouTube, Drive, Instagram, etc.)
const projects = [
    { name: 'Comet Edit', description: 'Beat-synced anime-style aesthetic edit: sideways 9:16 framing, hard cuts on every beat, push-ins and bloom.', link: 'edit/index.html' },
    { name: 'Project Video 2', description: 'Description for project 2', link: 'link_to_video2' },
    { name: 'Project Video 3', description: 'Description for project 3', link: 'link_to_video3' }
];

const renderProjects = () => {
    const container = document.getElementById('projects');
    projects.forEach(project => {
        const el = document.createElement('a');
        el.className = 'project';
        el.href = project.link;
        el.innerHTML = `<h4>${project.name}</h4><p>${project.description}</p><span>Watch →</span>`;
        container.appendChild(el);
    });
};

// Form validation
document.getElementById('myForm').addEventListener('submit', e => {
    e.preventDefault();
    const status = document.getElementById('form-status');
    const name = document.getElementById('name').value.trim();
    status.textContent = name ? `Thanks, ${name}! I'll get back to you soon.` : 'Name must be filled out!';
});

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
});

// Hero reel — the live Comet Edit
const reel = new CometEdit(document.getElementById('reel'), { title: 'ADINATH PATADE', subtitle: 'VIDEO EDITOR' });
const beat = new BeatTrack(reel.o.bpm);
reel.onFrame = t => beat.sync(t);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const playBtn = document.getElementById('reel-play');
const togglePlay = () => {
    if (reel.playing) { reel.pause(); beat.stop(); } else { reel.play(); }
    playBtn.textContent = reel.playing ? '❚❚' : '▶';
};
playBtn.addEventListener('click', togglePlay);
document.getElementById('reel').addEventListener('click', togglePlay);
document.getElementById('reel-sound').addEventListener('click', e => {
    beat.enabled = !beat.enabled;
    if (!beat.enabled) beat.stop();
    e.target.textContent = beat.enabled ? 'Sound on' : 'Sound off';
});
if (reduceMotion) { reel.renderFrame(reel.duration - 0.1); playBtn.textContent = '▶'; } else { reel.play(); }

renderProjects();
