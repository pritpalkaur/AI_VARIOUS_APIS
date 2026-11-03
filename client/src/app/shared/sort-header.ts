import { Component, computed, input, output } from '@angular/core';
import { SortState } from '../core/models';

/**
 * Clickable table header: `<th appSortHeader field="price" label="Price" [sort]="sort()" (sortChange)="...">`.
 * First click sorts ascending, the next one descending.
 */
@Component({
  selector: 'th[appSortHeader]',
  host: { '[attr.aria-sort]': 'ariaSort()' },
  template: `
    <button type="button" class="sort-button" (click)="toggle()">{{ label() }}{{ arrow() }}</button>
  `,
})
export class SortHeader {
  readonly field = input.required<string>();
  readonly label = input.required<string>();
  readonly sort = input.required<SortState>();
  readonly sortChange = output<SortState>();

  private readonly active = computed(() => this.sort().sortBy === this.field());
  protected readonly arrow = computed(() => (this.active() ? (this.sort().sortDir === 'asc' ? ' ▲' : ' ▼') : ''));
  protected readonly ariaSort = computed(() =>
    this.active() ? (this.sort().sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
  );

  protected toggle(): void {
    const sortDir = this.active() && this.sort().sortDir === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ sortBy: this.field(), sortDir });
  }
}
