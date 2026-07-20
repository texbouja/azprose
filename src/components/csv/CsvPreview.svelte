<script lang="ts">
  import { parseCsvPreview, type CsvPreview } from "@/lib/csv";

  let { value = "" }: { value?: string } = $props();

  let preview = $derived<CsvPreview | null>(
    value.trim() ? parseCsvPreview(value) : null,
  );
</script>

{#if preview}
  <div class="csv-preview">
    <div class="csv-preview__table-wrap">
      <table class="csv-preview__table">
        <thead>
          <tr>
            {#each preview.headers as header}
              <th>{header}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each preview.rows as row}
            <tr>
              {#each row as cell}
                <td>{cell}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="csv-preview__meta">
      {preview.totalRows} rows
      {#if preview.truncatedRows}
        <span class="csv-preview__truncated">
          (showing first {preview.rows.length})
        </span>
      {/if}
      {#if preview.truncatedColumns}
        <span class="csv-preview__truncated">
          · {preview.totalColumns} columns (max {20})
        </span>
      {/if}
    </div>
  </div>
{:else}
  <div class="csv-preview csv-preview--empty">
    <p>Empty file</p>
  </div>
{/if}

<style>
  .csv-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 16px 24px;
    overflow: hidden;
  }

  .csv-preview--empty {
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .csv-preview__table-wrap {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .csv-preview__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
    font-family: var(--font-mono);
    line-height: 1.5;
    white-space: nowrap;
  }

  .csv-preview__table th {
    position: sticky;
    top: 0;
    background: var(--surface);
    border-bottom: 2px solid var(--border);
    text-align: left;
    padding: 6px 12px;
    font-weight: 600;
    color: var(--fg);
  }

  .csv-preview__table td {
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--fg);
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .csv-preview__table tr:hover td {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }

  .csv-preview__meta {
    flex-shrink: 0;
    padding: 8px 0 0;
    font-size: 0.8em;
    color: var(--muted);
  }

  .csv-preview__truncated {
    font-style: italic;
  }
</style>
