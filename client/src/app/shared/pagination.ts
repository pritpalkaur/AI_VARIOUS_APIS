import { Component, input, output } from '@angular/core';
import { Pagination as PaginationInfo } from '../core/models';

@Component({
  selector: 'app-pagination',
  template: `
    @if (pagination(); as p) {
      <div class="pagination">
        <span class="muted">{{ p.totalItems }} item{{ p.totalItems === 1 ? '' : 's' }}</span>
        <span class="spacer"></span>
        <label class="inline">
          Per page
          <select [value]="p.pageSize" (change)="pageSizeChange.emit(+$any($event.target).value)">
            @for (size of sizes; track size) {
              <option [value]="size" [selected]="size === p.pageSize">{{ size }}</option>
            }
          </select>
        </label>
        <button type="button" class="btn btn-ghost" [disabled]="p.page <= 1" (click)="pageChange.emit(p.page - 1)">
          ‹ Prev
        </button>
        <span>Page {{ p.totalPages === 0 ? 0 : p.page }} of {{ p.totalPages }}</span>
        <button
          type="button"
          class="btn btn-ghost"
          [disabled]="p.page >= p.totalPages"
          (click)="pageChange.emit(p.page + 1)"
        >
          Next ›
        </button>
      </div>
    }
  `,
})
export class Pagination {
  protected readonly sizes = [10, 20, 50, 100];
  readonly pagination = input<PaginationInfo | null>(null);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
}
