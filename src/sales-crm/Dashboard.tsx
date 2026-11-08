const groups = [
  {
    title: 'Performance',
    cards: [
      { title: 'Monthly Commission', status: 'Coming Soon', detail: 'Commission Calculation Coming Soon' },
      { title: 'New Customers', status: 'No data yet', detail: 'Customer records are pending.' },
    ],
  },
  {
    title: 'Goal Tracking',
    cards: [
      { title: 'Weekly Sales Goal', status: 'Not configured', detail: 'Weekly goal tracking is pending.' },
      { title: 'Monthly Sales Goal', status: 'Not configured', detail: 'Monthly goal tracking is pending.' },
    ],
  },
  {
    title: 'Activity',
    cards: [
      { title: 'Today’s Follow-Ups', status: 'No data yet', detail: 'Follow-up tracking is pending.' },
      { title: 'Overdue Follow-Ups', status: 'No data yet', detail: 'Overdue tasks will appear here.' },
      { title: 'AI Sales Recommendations', status: 'Coming Soon', detail: 'Recommendations are pending.' },
    ],
  },
  {
    title: 'Sales Intelligence',
    cards: [
      { title: 'Sales Pipeline', status: 'No data yet', detail: 'Pipeline records are pending.' },
      { title: 'Reorder Opportunities', status: 'Not configured', detail: 'Verified purchase history is pending.' },
      { title: 'At-Risk Customers', status: 'Not configured', detail: 'Customer activity data is pending.' },
    ],
  },
];

export function DashboardCard({ title, status, detail }: {
  title: string; status: string; detail: string;
}) {
  return (
    <article className="panel sales-crm-card">
      <h3>{title}</h3>
      <strong>{status}</strong>
      <p>{detail}</p>
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
