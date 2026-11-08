import { salesCrmPath } from '../../shared/sales-crm';

const invoiceReportingPath = salesCrmPath + '/reports#invoice-reporting';

const groups = [
  {
    title: 'Performance',
    cards: [
      { title: 'Monthly Sales', status: 'Not configured', detail: 'Waiting for verified first-email evidence.', href: invoiceReportingPath },
      { title: 'Monthly Commission', status: 'Coming Soon', detail: 'Commission calculation coming soon.' },
      { title: 'Monthly Invoices', status: 'Not configured', detail: 'Verified invoice data will appear here.', href: invoiceReportingPath },
      { title: 'New Customers', status: 'No data yet', detail: 'Customer records are pending.' },
    ],
  },
  {
    title: 'Goal Tracking',
    cards: [
      { title: 'Weekly Goal', status: 'Not configured', detail: 'Weekly goal tracking is pending.' },
      { title: 'Monthly Goal', status: 'Not configured', detail: 'Monthly goal tracking is pending.' },
    ],
  },
  {
    title: 'Activity',
    cards: [
      { title: 'Today’s Follow-Ups', status: 'No data yet', detail: 'Follow-up tracking is pending.' },
      { title: 'Overdue Follow-Ups', status: 'No data yet', detail: 'Overdue tasks will appear here.' },
      { title: 'AI Recommended Actions', status: 'Coming Soon', detail: 'Recommendations are pending.' },
    ],
  },
  {
    title: 'Sales Intelligence',
    cards: [
      { title: 'Sales Pipeline', status: 'No data yet', detail: 'Pipeline records are pending.' },
      { title: 'Reorder Opportunities', status: 'Not configured', detail: 'Verified purchase history is pending.' },
      { title: 'At-Risk Customers', status: 'Not configured', detail: 'Customer activity data is pending.' },
      { title: 'Sales Trends', status: 'Not configured', detail: 'Verified sales history is pending.' },
    ],
  },
];

export function DashboardCard({ title, status, detail, href }: {
  title: string; status: string; detail: string; href?: string;
}) {
  return (
    <article className="panel sales-crm-card">
      <h3>{title}</h3>
      <strong>{status}</strong>
      <p>{detail}</p>
      {href && <a className="sales-crm-link" href={href} aria-label={title + ' reporting status'}>Reporting status</a>}
    </article>
  );
}

export function Dashboard() {
  return groups.map(group => (
    <section key={group.title} className="sales-crm-group" aria-label={group.title}>
      <h2>{group.title}</h2>
      <div className="sales-crm-cards">
        {group.cards.map(card => <DashboardCard key={card.title} {...card} />)}
      </div>
    </section>
  ));
}
