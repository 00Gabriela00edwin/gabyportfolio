import { Sparkles } from 'lucide-react';

const links = [
  { href: '#hero', label: 'Inicio' },
  { href: '#projects', label: 'Proyectos' },
  { href: '#about', label: 'Sobre mí' },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-space-900/85 backdrop-blur-xl">
      <nav aria-label="Navegación principal" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#hero" className="flex items-center gap-2 font-semibold text-slate-100">
          <Sparkles aria-hidden="true" className="h-5 w-5 text-neon-cyan" />
          <span>Gaby Edwin</span>
        </a>
        <ul className="flex items-center gap-5 text-sm text-slate-300 sm:gap-8">
          {links.map((link) => (
            <li key={link.href}>
              <a className="transition-colors hover:text-neon-cyan" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}