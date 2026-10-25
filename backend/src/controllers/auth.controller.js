export async function getCurrentUser(req, res) {
  res.json({
    data: {
      id: req.user.id,
      email: req.user.email,
      emailConfirmedAt: req.user.email_confirmed_at,
      createdAt: req.user.created_at,
    },
    meta: { requestId: req.id },
  });
}
