import { ExternalLink, Layers } from 'lucide-react';

const projects = [
  {
    title: "E-commerce & Paneles Nowin",
    category: "React / Vite / Tailwind / Firebase",
    description: "Aplicación web completa para gestión de stock y ventas de especias, con integración de paneles administrativos y pasarela de datos.",
    tags: ["React", "Tailwind", "Firebase", "Retool"]
  },
  {
    title: "Artes del Fuego - Sistema de Inventario",
    category: "Gestión & Taller de Arte",
    description: "Plataforma web desarrollada para el control de inventario de materiales cerámicos, hornos y herramientas del taller.",
    tags: ["React.js", "UI/UX Design", "Vercel"]
  },
  {
    title: "Interfaces Espaciales & Dashboards",
    category: "Diseño UI/UX Avanzado",
    description: "Prototipos interactivos y componentes altamente animados inspirados en la astronomía y la observación estelar.",
    tags: ["Figma", "Framer Motion", "GSAP"]
  }
];

export default function ProjectsGrid() {
  return (
    <section id="projects" className="py-20 px-6 max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent">
          Paneles & Aplicaciones Web
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto">
          Explora los desarrollos y interfaces que diseñé y programé utilizando arquitecturas modernas en React.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {projects.map((project, index) => (
          <div 
            key={index}
            className="bg-space-800/50 border border-slate-800 hover:border-neon-cyan/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 flex flex-col justify-between backdrop-blur-sm shadow-xl"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <Layers className="w-8 h-8 text-neon-cyan" />
                <span className="text-xs text-neon-purple font-mono bg-neon-purple/10 px-3 py-1 rounded-full">
                  {project.category}
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2 text-slate-100">{project.title}</h3>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">{project.description}</p>
            </div>

            <div>
              <div className="flex flex-wrap gap-2 mb-6">
                {project.tags.map((tag, i) => (
                  <span key={i} className="text-xs bg-space-700/80 text-slate-300 px-2.5 py-1 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
              <button className="w-full flex items-center justify-center gap-2 bg-space-700 hover:bg-neon-cyan hover:text-space-900 text-slate-200 py-2.5 rounded-xl transition-colors font-medium text-sm">
                <span>Ver Panel Interactivo</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}