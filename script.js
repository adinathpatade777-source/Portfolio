// script.js

// Render projects dynamically
const projects = [
    { name: 'Project 1', description: 'Description for project 1' },
    { name: 'Project 2', description: 'Description for project 2' },
    { name: 'Project 3', description: 'Description for project 3' }
];

const renderProjects = () => {
    const projectContainer = document.getElementById('projects');
    projects.forEach(project => {
        const projectElement = document.createElement('div');
        projectElement.classList.add('project');
        projectElement.innerHTML = `<h3>${project.name}</h3><p>${project.description}</p>`;
        projectContainer.appendChild(projectElement);
    });
};

// Form validation
const form = document.getElementById('myForm');
form.addEventListener('submit', function (e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    if (name === '') {
        alert('Name must be filled out!');
    } else {
        alert('Form submitted successfully!');
    }
});

// Theme toggle functionality
const toggleButton = document.getElementById('theme-toggle');
toggleButton.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
});

// Initial render
window.onload = renderProjects();