import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveOutreachSignals,
  summarizeCompanyProfile,
  summarizePersonProfile,
} from './lead-data-providers.js'

test('summarizePersonProfile keeps role history for personalization', () => {
  const profile = summarizePersonProfile({
    first_name: 'Asha',
    last_name: 'Patel',
    title: 'Medical Director',
    city: 'Austin',
    state: 'TX',
    employment_history: [
      { current: true, title: 'Medical Director', organization_name: 'CareCo', start_date: '2026-05-01' },
      { current: false, title: 'Physician', organization_name: 'Clinic One', end_date: '2026-04-01' },
    ],
  })
  assert.equal(profile.full_name, 'Asha Patel')
  assert.equal(profile.title, 'Medical Director')
  assert.equal(profile.current_role.company, 'CareCo')
  assert.equal(profile.prior_roles.length, 1)
})

test('summarizeCompanyProfile flattens firmographics', () => {
  const company = summarizeCompanyProfile({
    name: 'CareCo',
    primary_domain: 'careco.example',
    industry: 'hospital & health care',
    estimated_num_employees: 320,
    total_funding_printed: '$12M',
    short_description: 'Clinic network for metabolic care',
    technology_names: ['Salesforce', 'Epic'],
  })
  assert.equal(company.domain, 'careco.example')
  assert.equal(company.employee_count, 320)
  assert.equal(company.funding, '$12M')
  assert.deepEqual(company.technologies, ['Salesforce', 'Epic'])
})

test('deriveOutreachSignals surfaces new role and funding', () => {
  const signals = deriveOutreachSignals(
    {
      title: 'HR Director',
      employment_history: [
        { current: true, title: 'HR Director', organization_name: 'Acme', start_date: new Date().toISOString() },
      ],
    },
    {
      industry: 'computer software',
      funding: 'Series B',
      employee_count: 250,
      technologies: ['Workday'],
      description: 'Employee benefits platform',
    },
  )
  const types = signals.map((s) => s.type)
  assert.ok(types.includes('new_role'))
  assert.ok(types.includes('funding'))
  assert.ok(types.includes('tech_stack'))
})
