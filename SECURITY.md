# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Please report (suspected) security vulnerabilities to **[security@unit-talk.com]** or through GitHub's security advisory feature. You will receive a response from us within 48 hours. If the issue is confirmed, we will release a patch as soon as possible depending on complexity but typically within 7 days.

## Security Update Process

1. **Discovery**: Security issues can be reported via email or GitHub security advisories
2. **Triage**: Within 48 hours, we assess the severity and impact
3. **Fix**: Development of security patch begins immediately for confirmed vulnerabilities
4. **Review**: Security fixes undergo additional review before release
5. **Release**: Patches are released with security advisory
6. **Disclosure**: After patch release, details are disclosed responsibly

## Security Best Practices

### For Contributors

- **Never commit secrets**: Use environment variables for sensitive data
- **Dependency updates**: Keep dependencies up to date, especially security patches
- **Code review**: All code must be reviewed before merging
- **Testing**: Security-sensitive changes require additional testing

### For Users

- **Environment variables**: Always use `.env` files for configuration, never commit them
- **Database security**: Use strong passwords and restrict database access
- **API keys**: Rotate API keys regularly
- **Updates**: Apply security updates promptly

## Dependency Management

We use the following tools to maintain security:

- **npm audit**: Run automatically in CI/CD pipeline
- **Dependabot**: Automated dependency updates for security patches
- **Renovate**: Scheduled dependency updates with automatic testing

### Security Checklist

- [ ] All environment variables are properly configured
- [ ] Database connections use SSL/TLS
- [ ] API endpoints have proper authentication
- [ ] Rate limiting is configured
- [ ] CORS is properly configured
- [ ] Input validation is implemented
- [ ] SQL injection prevention measures are in place
- [ ] XSS protection is enabled
- [ ] CSRF tokens are used where appropriate
- [ ] Logs don't contain sensitive information

## Security Headers

Recommended security headers for production:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Compliance

This project aims to comply with:

- OWASP Top 10 security practices
- GDPR for data protection (where applicable)
- SOC 2 Type II principles (in progress)

## Security Contacts

- Primary: @griff843
- Email: security@unit-talk.com
- GitHub Security Advisories: [Enable on repository]

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who help us maintain the security of Unit Talk Core.

## Update Schedule

- **Critical** (CVSS 9.0-10.0): Within 24 hours
- **High** (CVSS 7.0-8.9): Within 7 days
- **Medium** (CVSS 4.0-6.9): Within 30 days
- **Low** (CVSS 0.1-3.9): Next regular release

Last Updated: 2025-08-23