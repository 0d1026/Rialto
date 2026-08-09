# @rialto/seller-sdk

Helpers for sellers to declare discovery metadata correctly - service name, tags,
descriptions, per-parameter descriptions, route templates - and validate it locally
before it ever reaches an index. Malformed listings are a real, observed problem in
production catalogs today; this package exists so a seller cannot easily publish one.
