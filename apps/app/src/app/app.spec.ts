import { type ComponentFixture, TestBed } from '@angular/core/testing';

import App from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let host: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(App);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render h1 with title', () => {
    const h1 = host.querySelector('h1');
    expect(h1?.textContent).toContain('HexVis');
  });
});
