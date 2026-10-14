import { render, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { SECTIONS } from '../utils/site';
import { SectionNav } from './SectionNav';
import { SiteHeader } from './SiteHeader';

// The in-page navigation (P-25 S7). The section components import the package at runtime, which
// demo tests never do (P-25 decision 9), so each link's target is checked in its component's
// source: one section with that ID, named by its own h2, under the eyebrow the link repeats.

const COMPONENTS = resolve(__dirname);
const SOURCES = Object.fromEntries(
  readdirSync(COMPONENTS)
    .filter(file => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
    .map(file => [file, readFileSync(resolve(COMPONENTS, file), 'utf8')])
);
const APP = readFileSync(resolve(COMPONENTS, '../App.tsx'), 'utf8');

/** The one component file that renders the section with this ID. */
function sectionSource(id: string): { file: string; source: string } {
  const owners = Object.entries(SOURCES).filter(([, source]) =>
    source.includes(`<section id="${id}"`)
  );
  expect(owners.map(([file]) => file)).toHaveLength(1);
  const [file, source] = owners[0]!;
  return { file, source };
}

describe('the section navigation', () => {
  it('is a named navigation landmark of plain fragment links, in page order', () => {
    render(<SectionNav />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(SECTIONS.map(section => section.label));
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      SECTIONS.map(section => `#${section.id}`)
    );
    for (const link of links) {
      expect(link.hasAttribute('target')).toBe(false);
      expect(link.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('has unique targets', () => {
    const ids = SECTIONS.map(section => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SECTIONS.map(section => [section.id, section]))(
    'leads to a section named by its own heading: #%s',
    (id, { label }) => {
      const { source } = sectionSource(id);
      // The ID appears once in the demo, on the section.
      const uses = Object.values(SOURCES).flatMap(text => [
        ...text.matchAll(new RegExp(`id="${id}"`, 'g')),
      ]);
      expect(uses).toHaveLength(1);
      expect(source).toContain(
        `<section id="${id}" className="d-section" aria-labelledby="${id}-heading">`
      );
      expect(source).toMatch(new RegExp(`<h2 id="${id}-heading" className="d-section__title">`));
      // The link's label is the section's eyebrow, so the link reads as the place it leads to.
      expect(source).toContain(`<p className="d-eyebrow">${label}</p>`);
    }
  );

  it('lists the sections in the order the page renders them', () => {
    const order = SECTIONS.map(({ id }) => {
      const component = sectionSource(id).file.replace('.tsx', '');
      const index = APP.search(new RegExp(`<${component}[\\s/]`));
      expect(index).toBeGreaterThan(-1);
      return index;
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('is skipped by the skip link, which leads to the main content', () => {
    expect(APP).toContain('<a className="d-skip-link" href="#main">');
    expect(APP).toContain('<main id="main">');
    expect(APP.indexOf('d-skip-link')).toBeLessThan(APP.indexOf('<SiteHeader'));
  });
});

describe('the header', () => {
  const renderHeader = () =>
    render(
      <SiteHeader
        theme="system"
        onThemeChange={() => {}}
        direction="ltr"
        onDirectionChange={() => {}}
      />
    );

  it('holds the section navigation beside the project links, each landmark named', () => {
    renderHeader();
    const banner = screen.getByRole('banner');
    const navs = within(banner).getAllByRole('navigation');
    expect(navs.map(nav => nav.getAttribute('aria-label'))).toEqual(['Project', 'Sections']);
  });

  it('has no axe violations', async () => {
    renderHeader();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
