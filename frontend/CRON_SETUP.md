# Tâches automatiques (cron) — configuration externe

Le plan gratuit ("Hobby") de Vercel limite les tâches cron natives à une
exécution par jour maximum. ScolaGest a besoin de tâches plus fréquentes
(traitement des emails, expiration des commandes, etc.), donc elles sont
déclenchées depuis un service externe gratuit — [cron-job.org](https://cron-job.org) —
plutôt que via `vercel.json` (volontairement vide, voir ce fichier).

## À configurer sur cron-job.org (compte gratuit)

Pour chaque ligne ci-dessous, créer une tâche ("cronjob") avec :
- **URL** : `https://<votre-domaine>.vercel.app` + le chemin indiqué
- **Méthode** : `POST`
- **En-tête (Header)** : `Authorization` = `Bearer <valeur de CRON_SECRET>`
  (la même valeur que celle mise dans les variables d'environnement Vercel)
- **Fréquence** : comme indiqué

| Chemin | Fréquence | Description |
|---|---|---|
| `/api/cron/outbox-drain` | chaque minute | Envoie les notifications en attente |
| `/api/cron/email-queue-drain` | chaque minute | Envoie les emails en attente |
| `/api/cron/verification-cleanup` | chaque heure | Nettoie les codes de vérification expirés |
| `/api/cron/order-expiration` | toutes les 5 minutes | Expire les commandes non payées |
| `/api/cron/webhook-log-purge` | 1 fois par jour (minuit) | Purge les anciens logs de webhook |
| `/api/cron/email-job-purge` | 1 fois par jour (minuit) | Purge les anciens emails traités |
| `/api/cron/subscription-reminders` | 1 fois par jour (8h UTC) | Rappels d'abonnement à J-15/J-7/J-1 |

Chaque route vérifie elle-même l'en-tête `Authorization` (voir
`src/lib/server/cron/auth.ts`) — peu importe qui l'appelle (Vercel ou un
service externe), tant que le bon `CRON_SECRET` est présent.
